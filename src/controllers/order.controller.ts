import z from "zod"
import { prisma } from "../database/prisma.js"
import type { AuthenticatedHandler } from "../middleware/protectedHandler.js"
import { placeOrder } from "../services/order.service.js"
import { AppError } from "../errors/AppError.js"
import { paginate } from "../lib/paginate.js"
import { indexOrderSchema } from "../validations/order.schema.js"

const orderSchema = z.object({
	id: z.cuid2(),
})

export const index: AuthenticatedHandler = async (request, response) => {
	const { page, perPage, status } = indexOrderSchema.parse(request.query)

	const where = { userId: request.userId, ...(status && { status }) }

	const [orders, total] = await Promise.all([
		prisma.order.findMany({
			where,
			skip: (page - 1) * perPage,
			take: perPage,
			orderBy: { createdAt: "desc" },
			include: {
				items: {
					include: { product: true },
				},
			},
		}),
		prisma.order.count({ where }),
	])

	if (!orders) throw new AppError(404, "Orders not found")

	return response.status(200).json(
		paginate({
			request,
			data: orders,
			total,
			page,
			perPage,
		})
	)
}

export const show: AuthenticatedHandler = async (request, response) => {
	const { id } = orderSchema.parse(request.params)
	const order = await prisma.order.findUnique({
		where: { id, userId: request.userId },
		include: {
			items: {
				include: { product: true },
			},
		},
	})

	if (!order) throw new AppError(404, "Order not found")

	return response
		.status(200)
		.json({ message: "Order fetched successfully", order })
}

export const store: AuthenticatedHandler = async (request, response) => {
	const order = await placeOrder(request.userId)

	return response.status(201).json({ data: order })
}
export const update: AuthenticatedHandler = (request, response) => {}
export const destroy: AuthenticatedHandler = (request, response) => {}
