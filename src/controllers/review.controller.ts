import type {
	AuthenticatedHandler,
	AuthenticatedRequest,
} from "../middleware/protectedHandler.js"
import type { Request, RequestHandler, Response } from "express"
import {
	createReviewSchema,
	destroyReviewSchema,
	updateReviewSchema,
} from "../validations/review.schema.js"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import { paginate } from "../lib/paginate.js"
import { urlQuerySchema } from "../validations/url-query.schema.js"
import { getProductReviews } from "../services/review.service.js"
import { ImageableType, VideoableType } from "@prisma/client"
import z from "zod"

export const productReviews: RequestHandler = async (
	request: Request,
	response: Response
): Promise<Response> => {
	const { page, perPage } = urlQuerySchema.parse(request.query)
	const { id } = z.object({ id: z.uuid() }).parse(request.params)

	const { reviews, reviewsCount } = await getProductReviews({
		productId: id,
		page,
		perPage,
	})

	return response.status(200).json(
		paginate({
			request,
			data: reviews,
			total: reviewsCount,
			page,
			perPage,
		})
	)
}

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

	return response
		.status(201)
		.json({ review: { ...review, images: [], videos: [] } })
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

	const [images, videos] = await Promise.all([
		prisma.image.findMany({
			where: {
				imageableType: ImageableType.REVIEW,
				imageableId: review.id,
			},
		}),
		prisma.video.findMany({
			where: {
				videoableType: VideoableType.REVIEW,
				videoableId: review.id,
			},
		}),
	])

	return response.status(200).json({ review: { ...review, images, videos } })
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
