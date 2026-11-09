import type { Response } from "express"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import { paginate } from "../lib/paginate.js"
import type {
	AuthenticatedHandler,
	AuthenticatedRequest,
} from "../middleware/protectedHandler.js"
import {
	commentIdParamSchema,
	createReviewCommentSchema,
	indexReviewCommentsSchema,
	reviewIdParamSchema,
	updateReviewCommentSchema,
} from "../validations/review-comment.schema.js"

export const index: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { reviewId } = reviewIdParamSchema.parse(request.params)
	const { page, perPage, parentId, topLevelOnly } =
		indexReviewCommentsSchema.parse(request.query)

	const where = {
		reviewId,
		deletedAt: null,
		...(topLevelOnly ? { parentId: null } : {}),
		...(parentId ? { parentId } : {}),
	}

	const [comments, total] = await Promise.all([
		prisma.reviewComment.findMany({
			where,
			skip: (page - 1) * perPage,
			take: perPage,
			orderBy: { createdAt: "asc" },
			include: {
				_count: { select: { replies: true } },
			},
		}),
		prisma.reviewComment.count({ where }),
	])

	return response.status(200).json(
		paginate({
			request,
			data: comments,
			total,
			page,
			perPage,
		})
	)
}

export const store: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { reviewId } = reviewIdParamSchema.parse(request.params)
	const { body, parentId } = createReviewCommentSchema.parse(request.body)

	const review = await prisma.review.findUnique({
		where: { id: reviewId },
		select: { id: true, deletedAt: true },
	})
	if (!review || review.deletedAt) {
		throw new AppError(404, "Review not found")
	}

	if (parentId) {
		const parent = await prisma.reviewComment.findUnique({
			where: { id: parentId },
			select: { reviewId: true, deletedAt: true },
		})
		if (!parent || parent.deletedAt || parent.reviewId !== reviewId) {
			throw new AppError(404, "Parent comment not found")
		}
	}

	const comment = await prisma.reviewComment.create({
		data: {
			reviewId,
			userId: request.userId,
			body,
			...(parentId && { parentId }),
		},
	})

	return response.status(201).json({ data: comment })
}

export const update: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { id } = commentIdParamSchema.parse(request.params)
	const { body } = updateReviewCommentSchema.parse(request.body)

	const existing = await prisma.reviewComment.findUnique({ where: { id } })
	if (!existing || existing.deletedAt) {
		throw new AppError(404, "Comment not found")
	}
	if (existing.userId !== request.userId) {
		throw new AppError(404, "Comment not found")
	}

	const comment = await prisma.reviewComment.update({
		where: { id },
		data: { body },
	})

	return response.status(200).json({ data: comment })
}

export const destroy: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { id } = commentIdParamSchema.parse(request.params)

	const existing = await prisma.reviewComment.findUnique({ where: { id } })
	if (!existing || existing.deletedAt) {
		throw new AppError(404, "Comment not found")
	}
	if (existing.userId !== request.userId) {
		throw new AppError(404, "Comment not found")
	}

	await prisma.reviewComment.update({
		where: { id },
		data: { deletedAt: new Date() },
	})

	return response.status(204).send()
}
