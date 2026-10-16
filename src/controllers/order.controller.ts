import { AppError } from "../errors/AppError.js"
import { prisma } from "../database/prisma.js"
import type { AuthenticatedHandler } from "../middleware/protectedHandler.js"

export const index: AuthenticatedHandler = (request, response) => {}
export const show: AuthenticatedHandler = (request, response) => {}
export const store: AuthenticatedHandler = async (request, response) => {
	const order = await prisma.$transaction(async (tx) => {
		const cart = await tx.cart.findUnique({
			where: { userId: request.userId },
			include: {
				items: {
					where: { deletedAt: null },
					select: { id: true, productId: true, quantity: true },
				},
			},
		})

		if (!cart || cart.items.length === 0) {
			throw new AppError(
				422,
				"Cannot create an order from an empty cart."
			)
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

		const invalidItems = cart.items.flatMap((item) => {
			const product = productsById.get(item.productId)
			const base = {
				productId: item.productId,
				productName: product?.name ?? null,
				requestedQuantity: item.quantity,
			}

			if (!product) return [{ ...base, reason: "product_not_found" }]
			if (product.deletedAt)
				return [{ ...base, reason: "product_deleted" }]
			if (!product.isActive)
				return [{ ...base, reason: "product_inactive" }]
			if (item.quantity < 1)
				return [{ ...base, reason: "invalid_quantity" }]
			if (product.stock < item.quantity) {
				return [
					{
						...base,
						reason: "insufficient_stock",
						availableStock: product.stock,
					},
				]
			}

			return []
		})

		if (invalidItems.length > 0) {
			throw new AppError(
				422,
				"One or more cart items cannot be ordered.",
				{
					items: invalidItems,
				}
			)
		}

		const orderItems = cart.items.map((item) => {
			const product = productsById.get(item.productId)
			if (!product) {
				throw new AppError(422, "A cart product could not be found.", {
					items: [
						{
							productId: item.productId,
							reason: "product_not_found",
						},
					],
				})
			}

			return { item, product }
		})

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
				const reason = !currentProduct
					? "product_not_found"
					: currentProduct.deletedAt
						? "product_deleted"
						: !currentProduct.isActive
							? "product_inactive"
							: "insufficient_stock"

				throw new AppError(
					409,
					"Cart items changed while the order was being placed.",
					{
						items: [
							{
								productId: product.id,
								productName: product.name,
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
		const createdOrder = await tx.order.create({
			data: {
				userId: request.userId,
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

		return createdOrder
	})

	return response.status(201).json({ data: order })
}
export const update: AuthenticatedHandler = (request, response) => {}
export const destroy: AuthenticatedHandler = (request, response) => {}
