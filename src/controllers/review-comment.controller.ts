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
import { CommentableType, ImageableType, VideoableType } from "@prisma/client"

export const index: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { reviewId } = reviewIdParamSchema.parse(request.params)
	const { page, perPage, parentId, topLevelOnly } =
		indexReviewCommentsSchema.parse(request.query)

	const where = {
		commentableId: reviewId,
		commentableType: CommentableType.REVIEW,
		deletedAt: null,
		...(topLevelOnly ? { parentId: null } : {}),
		...(parentId ? { parentId } : {}),
	}

	const [comments, total] = await Promise.all([
		prisma.comment.findMany({
			where,
			skip: (page - 1) * perPage,
			take: perPage,
			orderBy: { createdAt: "asc" },
			include: {
				_count: { select: { replies: true } },
			},
		}),
		prisma.comment.count({ where }),
	])

	const commentIds = comments.map((comment) => comment.id)
	const [images, videos] = commentIds.length
		? await Promise.all([
				prisma.image.findMany({
					where: {
						imageableType: ImageableType.COMMENT,
						imageableId: { in: commentIds },
					},
				}),
				prisma.video.findMany({
					where: {
						videoableType: VideoableType.COMMENT,
						videoableId: { in: commentIds },
					},
				}),
			])
		: [[], []]

	const data = comments.map((comment) => ({
		...comment,
		images: images.filter((image) => image.imageableId === comment.id),
		videos: videos.filter((video) => video.videoableId === comment.id),
	}))

	return response.status(200).json(
		paginate({
			request,
			data,
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
		const parent = await prisma.comment.findUnique({
			where: { id: parentId },
			select: {
				commentableId: true,
				commentableType: true,
				deletedAt: true,
			},
		})
		if (
			!parent ||
			parent.deletedAt ||
			parent.commentableType !== CommentableType.REVIEW ||
			parent.commentableId !== reviewId
		) {
			throw new AppError(404, "Parent comment not found")
		}
	}

	const comment = await prisma.comment.create({
		data: {
			commentableId: reviewId,
			commentableType: CommentableType.REVIEW,
			userId: request.userId,
			body,
			...(parentId && { parentId }),
		},
	})

	return response
		.status(201)
		.json({ data: { ...comment, images: [], videos: [] } })
}

export const update: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { id } = commentIdParamSchema.parse(request.params)
	const { body } = updateReviewCommentSchema.parse(request.body)

	const existing = await prisma.comment.findUnique({ where: { id } })
	if (!existing || existing.deletedAt) {
		throw new AppError(404, "Comment not found")
	}
	if (existing.userId !== request.userId) {
		throw new AppError(404, "Comment not found")
	}

	const comment = await prisma.comment.update({
		where: { id },
		data: { body },
	})

	const [images, videos] = await Promise.all([
		prisma.image.findMany({
			where: {
				imageableType: ImageableType.COMMENT,
				imageableId: comment.id,
			},
		}),
		prisma.video.findMany({
			where: {
				videoableType: VideoableType.COMMENT,
				videoableId: comment.id,
			},
		}),
	])

	return response.status(200).json({ data: { ...comment, images, videos } })
}

export const destroy: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { id } = commentIdParamSchema.parse(request.params)

	const existing = await prisma.comment.findUnique({ where: { id } })
	if (!existing || existing.deletedAt) {
		throw new AppError(404, "Comment not found")
	}
	if (existing.userId !== request.userId) {
		throw new AppError(404, "Comment not found")
	}

	await prisma.comment.update({
		where: { id },
		data: { deletedAt: new Date() },
	})

	return response.status(204).send()
}
