import { IdempotencyStatus, Prisma } from "@prisma/client"
import { createHash } from "node:crypto"
import { env } from "../configs/env.js"
import { AppError } from "../errors/AppError.js"
import { prisma } from "../database/prisma.js"
import { getStockFailureReason } from "../helpers/index.js"

type InvalidOrderItem = {
	product: { id: string; name: string } | null
	requestedQuantity: number
	reason: string
	availableStock?: number
}

type PlacedOrder = Prisma.OrderGetPayload<{ include: { items: true } }>

const placeOrderInTransaction = async (
	tx: Prisma.TransactionClient,
	userId: string
): Promise<PlacedOrder> => {
	const cart = await tx.cart.findUnique({
		where: { userId },
		include: {
			items: {
				where: { deletedAt: null },
				select: { id: true, productId: true, quantity: true },
			},
		},
	})

	if (!cart || cart.items.length === 0) {
		throw new AppError(422, "Cannot create an order from an empty cart.")
	}

	const products = await tx.product.findMany({
		where: { id: { in: cart.items.map((item) => item.productId) } },
		select: {
			id: true,
			name: true,
			price: true,
			stock: true,
			isActive: true,
			deletedAt: true,
		},
	})
	const productsById = new Map(
		products.map((product) => [product.id, product])
	)

	const orderItems: Array<{
		item: (typeof cart.items)[number]
		product: (typeof products)[number]
	}> = []
	const invalidItems: InvalidOrderItem[] = []

	for (const item of cart.items) {
		const product = productsById.get(item.productId)
		const base = {
			product: product ? { id: product.id, name: product.name } : null,
			requestedQuantity: item.quantity,
		}

		if (!product) {
			invalidItems.push({ ...base, reason: "product_not_found" })
		} else if (product.deletedAt) {
			invalidItems.push({ ...base, reason: "product_deleted" })
		} else if (!product.isActive) {
			invalidItems.push({ ...base, reason: "product_inactive" })
		} else if (item.quantity < 1) {
			invalidItems.push({ ...base, reason: "invalid_quantity" })
		} else if (product.stock < item.quantity) {
			invalidItems.push({
				...base,
				reason: "insufficient_stock",
				availableStock: product.stock,
			})
		} else {
			orderItems.push({ item, product })
		}
	}

	if (invalidItems.length > 0) {
		throw new AppError(422, "One or more cart items cannot be ordered.", {
			items: invalidItems,
		})
	}

	for (const { item, product } of orderItems) {
		const reserved = await tx.product.updateMany({
			where: {
				id: product.id,
				isActive: true,
				deletedAt: null,
				stock: { gte: item.quantity },
			},
			data: { stock: { decrement: item.quantity } },
		})

		if (reserved.count === 0) {
			const currentProduct = await tx.product.findUnique({
				where: { id: product.id },
				select: { stock: true, isActive: true, deletedAt: true },
			})
			const reason = getStockFailureReason(currentProduct)

			throw new AppError(
				409,
				"Cart items changed while the order was being placed.",
				{
					items: [
						{
							product: currentProduct
								? { id: product.id, name: product.name }
								: null,
							requestedQuantity: item.quantity,
							reason,
							...(currentProduct && {
								availableStock: currentProduct.stock,
							}),
						},
					],
				}
			)
		}
	}

	const total = orderItems.reduce(
		(sum, { item, product }) => sum + product.price * item.quantity,
		0
	)
	const order = await tx.order.create({
		data: {
			userId,
			total,
			items: {
				create: orderItems.map(({ item, product }) => ({
					productName: product.name,
					unitPrice: product.price,
					quantity: item.quantity,
					product: { connect: { id: product.id } },
				})),
			},
		},
		include: { items: true },
	})

	await tx.cartItem.deleteMany({
		where: { id: { in: cart.items.map((item) => item.id) } },
	})

	return order
}

export const placeOrder = async (userId: string): Promise<PlacedOrder> =>
	prisma.$transaction((tx) => placeOrderInTransaction(tx, userId))

const ORDER_REQUEST_HASH = createHash("sha256")
	.update("place-order")
	.digest("hex")

const serializeOrder = (order: PlacedOrder): Prisma.InputJsonValue =>
	JSON.parse(JSON.stringify(order))

type IdempotencyRecord = {
	status: IdempotencyStatus
	responseStatus: number | null
	responseBody: Prisma.JsonValue | null
}

const getReplayableOrder = (
	record: IdempotencyRecord
): Prisma.JsonObject | null => {
	if (record.status !== IdempotencyStatus.COMPLETED) return null
	if (record.responseStatus !== 201) return null

	const body = record.responseBody
	if (body === null || typeof body !== "object" || Array.isArray(body)) {
		return null
	}
	if (typeof body.id !== "string") return null

	return body
}

const reserveOrderIdempotencyKey = async (
	userId: string,
	key: string
): Promise<
	| { kind: "reserved"; id: string }
	| { kind: "replay"; order: Prisma.JsonObject }
> => {
	const now = new Date()
	const expiresAt = new Date(now.getTime() + env.IDEMPOTENCY_TTL_MS)

	try {
		const record = await prisma.idempotencyKey.create({
			data: {
				userId,
				key,
				requestHash: ORDER_REQUEST_HASH,
				status: IdempotencyStatus.IN_PROGRESS,
				expiresAt,
			},
		})

		return { kind: "reserved", id: record.id }
	} catch (error) {
		//catch only unique unique contraint error because it will be dealth with later in the code
		if (
			!(
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === "P2002"
			)
		) {
			throw error
		}
	}

	const existing = await prisma.idempotencyKey.findUnique({
		where: { userId_key: { userId, key } },
	})
	if (!existing) {
		throw new AppError(409, "Unable to reserve idempotency key")
	}

	if (existing.expiresAt <= now) {
		const reclaimed = await prisma.idempotencyKey.updateMany({
			where: { id: existing.id, expiresAt: { lte: now } },
			data: {
				requestHash: ORDER_REQUEST_HASH,
				status: IdempotencyStatus.IN_PROGRESS,
				responseStatus: null,
				responseBody: Prisma.DbNull,
				expiresAt,
			},
		})
		if (reclaimed.count === 1) {
			return { kind: "reserved", id: existing.id }
		}

		throw new AppError(
			409,
			"Order placement with this idempotency key is still in progress"
		)
	}

	if (existing.requestHash !== ORDER_REQUEST_HASH) {
		throw new AppError(
			409,
			"Idempotency key was already used with different request details"
		)
	}

	const replayableOrder = getReplayableOrder(existing)
	if (replayableOrder) {
		return { kind: "replay", order: replayableOrder }
	}

	if (existing.status === IdempotencyStatus.COMPLETED) {
		throw new AppError(500, "Stored idempotency response is invalid")
	}

	if (existing.status === IdempotencyStatus.FAILED) {
		throw new AppError(
			409,
			"Previous order placement failed; use a new idempotency key"
		)
	}

	throw new AppError(
		409,
		"Order placement with this idempotency key is still in progress"
	)
}

export const placeOrderIdempotently = async (
	userId: string,
	key: string
): Promise<PlacedOrder | Prisma.JsonObject> => {
	const reservation = await reserveOrderIdempotencyKey(userId, key)
	if (reservation.kind === "replay") return reservation.order

	try {
		return await prisma.$transaction(async (tx) => {
			const order = await placeOrderInTransaction(tx, userId)
			await tx.idempotencyKey.update({
				where: { id: reservation.id },
				data: {
					status: IdempotencyStatus.COMPLETED,
					responseStatus: 201,
					responseBody: serializeOrder(order),
				},
			})
			return order
		})
	} catch (error) {
		await prisma.idempotencyKey.update({
			where: { id: reservation.id },
			data: { status: IdempotencyStatus.FAILED },
		})
		throw error
	}
}
