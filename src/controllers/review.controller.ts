import type {
	AuthenticatedHandler,
	AuthenticatedRequest,
} from "../middleware/protectedHandler.js"
import type { Response } from "express"
import {
	createReviewSchema,
	destroyReviewSchema,
	updateReviewSchema,
} from "../validations/review.schema.js"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"

export const store: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { productId, rating, title, body } = createReviewSchema.parse(
		request.body
	)

	const review = await prisma.review.create({
		data: {
			userId: request.userId,
			productId,
			rating,
			title,
			body,
			isVerifiedPurchase: true,
		},
	})

	return response.status(201).json({ review })
}

export const update: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { id } = destroyReviewSchema.parse(request.params)
	const { productId, rating, title, body } = updateReviewSchema
		.omit({ id: true })
		.parse(request.body)

	const existing = await prisma.review.findUnique({ where: { id } })
	if (!existing || existing.userId !== request.userId) {
		throw new AppError(404, "Review not found")
	}

	const review = await prisma.review.update({
		where: { id },
		data: { productId, rating, title, body },
	})

	return response.status(200).json({ review })
}

export const destroy: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { id } = destroyReviewSchema.parse(request.params)

	const existing = await prisma.review.findUnique({ where: { id } })
	if (!existing || existing.userId !== request.userId) {
		throw new AppError(404, "Review not found")
	}

	await prisma.review.delete({ where: { id } })

	return response.status(204).send()
}
