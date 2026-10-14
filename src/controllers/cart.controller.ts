import {
	createCartSchema,
	destroyCartSchema,
} from "../validations/cart.schema.js"
import type { AuthenticatedHandler } from "../middleware/protectedHandler.js"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"

export const index: AuthenticatedHandler = async (request, response) => {
	const cart = await prisma.cart.findUnique({
		where: { userId: request.userId },
		include: {
			items: {
				include: { product: true },
			},
		},
	})

	return response
		.status(200)
		.json({ message: "Cart fetched successfully", cart })
}

export const addItem: AuthenticatedHandler = async (request, response) => {
	const { productId, quantity } = createCartSchema.parse(request.body)

	await prisma.$transaction(async (tx) => {
		const product = await tx.product.findUnique({
			where: { id: productId },
		})
		if (!product) throw new AppError(404, "Product does not exists")

		const cart = await tx.cart.upsert({
			where: { userId: request.userId },
			create: { userId: request.userId },
			update: {},
		})

		if (!cart) throw new AppError(500, "Error creating or fetching cart")

		const created = await tx.cartItem.upsert({
			where: { cartId_productId: { cartId: cart.id, productId } },
			create: { productId, quantity, cartId: cart.id },
			update: { quantity },
		})

		if (!created) throw new AppError(500, "Error adding item to cart")
	})

	return response
		.status(201)
		.json({ message: "Item added to cart succesfully" })
}

export const removeIteam: AuthenticatedHandler = async (request, response) => {
	const { cartItemId } = destroyCartSchema.parse(request.params)

	const deleted = await prisma.cartItem.delete({ where: { id: cartItemId } })

	if (!deleted) throw new AppError(500, "Error deleting cart itme")

	return response
		.status(200)
		.json({ message: "Deleted cart item successfully" })
}

export const clearCart: AuthenticatedHandler = async (request, response) => {
	const items = await prisma.cartItem.deleteMany({
		where: { cart: { userId: request.userId } },
	})

	if (!items) throw new AppError(500, "Error clearing cart")

	return response.status(200).json({ message: "Cart cleared succesfully" })
}
