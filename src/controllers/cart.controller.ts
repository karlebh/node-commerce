import {
	createCartSchema,
	destroyCartSchema,
} from "../validations/cart.schema.js"
import type { Response } from "express"
import type {
	AuthenticatedHandler,
	AuthenticatedRequest,
} from "../middleware/protectedHandler.js"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import { paginate } from "../lib/paginate.js"
import { urlQuerySchema } from "../validations/url-query.schema.js"

export const index: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { page, perPage } = urlQuerySchema.parse(request.query)

	const cart = await prisma.cart.findUnique({
		where: { userId: request.userId },
		include: {
			_count: { select: { items: true } },
			items: {
				skip: (page - 1) * perPage,
				take: perPage,
				orderBy: { createdAt: "desc" },
				include: { product: true },
			},
		},
	})

	return response.status(200).json(
		paginate({
			request,
			data: cart?.items ?? [],
			total: cart?._count.items ?? 0,
			page,
			perPage,
		})
	)
}

export const addItem: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
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

export const removeIteam: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { id } = destroyCartSchema.parse(request.params)

	const deleted = await prisma.cartItem.delete({ where: { id } })

	if (!deleted) throw new AppError(500, "Error deleting cart itme")

	return response
		.status(200)
		.json({ message: "Deleted cart item successfully" })
}

export const clearCart: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const items = await prisma.cartItem.deleteMany({
		where: { cart: { userId: request.userId } },
	})

	if (!items) throw new AppError(500, "Error clearing cart")

	return response.status(200).json({ message: "Cart cleared succesfully" })
}
