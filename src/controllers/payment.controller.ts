import type { NextFunction, Request, RequestHandler, Response } from "express"
import { AppError } from "../errors/AppError.js"
import { prisma } from "../database/prisma.js"
import {
	initializePaymentIdempotently,
	processWebhook,
	verifyPayment as verifyPaymentService,
} from "../services/payment.service.js"
import type {
	AuthenticatedHandler,
	AuthenticatedRequest,
} from "../middleware/protectedHandler.js"
import {
	initializePaymentSchema,
	verifyPaymentSchema,
	webhookProviderSchema,
} from "../validations/payment.schema.js"
import { z } from "zod"

const idempotencyKeySchema = z.string().trim().min(1).max(255)

export const initializePayment: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const input = initializePaymentSchema.parse(request.body)
	const key = idempotencyKeySchema.safeParse(
		request.get("Idempotency-Key")
	)
	if (!key.success) {
		throw new AppError(400, "A valid Idempotency-Key header is required")
	}

	const user = await prisma.user.findUnique({
		where: { id: request.userId },
		select: { email: true },
	})
	if (!user) throw new AppError(404, "User not found")

	const result = await initializePaymentIdempotently(
		{
			userId: request.userId,
			email: user.email,
			amount: input.amount,
			currency: input.currency,
			provider: input.provider,
			orderId: input.orderId,
		},
		key.data
	)

	return response.status(201).json(result)
}

export const verifyPayment: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { reference } = verifyPaymentSchema.parse(request.params)

	const payment = await verifyPaymentService(reference)
	if (payment.userId !== request.userId) {
		throw new AppError(404, "Payment not found")
	}

	return response.status(200).json({ payment })
}

export const webhook: RequestHandler = async (
	request: Request,
	response: Response,
	next: NextFunction
): Promise<void> => {
	try {
		const { provider } = webhookProviderSchema.parse(request.params)

		if (!Buffer.isBuffer(request.body)) {
			throw new AppError(400, "Expected raw body for webhook")
		}

		await processWebhook(provider, request.body, request.headers)
		response.status(200).json({ received: true })
	} catch (error) {
		next(error)
	}
}
