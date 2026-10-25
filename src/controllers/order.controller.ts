import { prisma } from "../database/prisma.js"
import type { Response } from "express"
import type {
	AuthenticatedHandler,
	AuthenticatedRequest,
} from "../middleware/protectedHandler.js"
import { placeOrderIdempotently } from "../services/order.service.js"
import { AppError } from "../errors/AppError.js"
import { paginate } from "../lib/paginate.js"
import {
	indexOrderSchema,
	orderSchema,
	updateOrderschema,
} from "../validations/order.schema.js"
import { z } from "zod"

const idempotencyKeySchema = z.string().trim().min(1).max(255)

export const index: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
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

export const show: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
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

export const store: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const key = idempotencyKeySchema.safeParse(
		request.get("Idempotency-Key")
	)
	if (!key.success) {
		throw new AppError(400, "A valid Idempotency-Key header is required")
	}

	const order = await placeOrderIdempotently(request.userId, key.data)

	return response.status(201).json({ data: order })
}
export const update: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
) => {
	const { id } = orderSchema.parse(request.params)
	const { status } = updateOrderschema.parse(request.body)

	const order = await prisma.order.update({
		where: { id, userId: request.userId },
		data: { status },
	})

	if (!order) throw new AppError(404, "Order not found")

	return response
		.status(200)
		.json({ message: "Order updated successfully", order })
}

export const destroy: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { id } = orderSchema.parse(request.params)

	await prisma.order.delete({
		where: { id, userId: request.userId },
	})

	return response.status(200).json({ message: "Order deleted successfully" })
}
