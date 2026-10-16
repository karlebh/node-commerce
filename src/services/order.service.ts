import { AppError } from "../errors/AppError.js"
import { prisma } from "../database/prisma.js"

type InvalidOrderItem = {
	product: { id: string; name: string } | null
	requestedQuantity: number
	reason: string
	availableStock?: number
}

export const placeOrder = async (userId: string) =>
	prisma.$transaction(async (tx) => {
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

		const orderItems: Array<{
			item: (typeof cart.items)[number]
			product: (typeof products)[number]
		}> = []
		const invalidItems: InvalidOrderItem[] = []

		for (const item of cart.items) {
			const product = productsById.get(item.productId)
			const base = {
				product: product
					? { id: product.id, name: product.name }
					: null,
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
			throw new AppError(
				422,
				"One or more cart items cannot be ordered.",
				{ items: invalidItems }
			)
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
	})
