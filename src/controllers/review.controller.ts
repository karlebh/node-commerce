import { request } from "http"
import type {
	AuthenticatedHandler,
	AuthenticatedRequest,
} from "../middleware/protectedHandler.js"
import type { Response } from "express"
import {
	createReviewSchema,
	destroyReviewSchema,
	updateReviewSchema,
} from "../validations/review.sceham.js"
import { prisma } from "../database/prisma.js"

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
	const { id, productId, rating, title, body } = updateReviewSchema.parse(
		request.params
	)

	const review = await prisma.review.update({
		where: { userId_productId: { userId: request.userId, productId } },
		data: { rating, title, body },
	})

	return response.status(200).json({ review })
}

export const destroy: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { id } = destroyReviewSchema.parse(request.params)

	await prisma.review.delete({ where: { id } })

	return response.status(200).json({})
}
