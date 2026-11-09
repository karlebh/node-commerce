import {
	CommentableType,
	ImageableType,
	VideoableType,
	type Comment,
	type Image,
	type Review,
	type Video,
} from "@prisma/client"
import { prisma } from "../database/prisma.js"
import { indexBy } from "../lib/index-by.js"

export const COMMENTS_PER_PAGE = 10

export type CommentWithMedia = Comment & { images: Image[]; videos: Video[] }
export type ReviewWithMedia = Review & {
	images: Image[]
	videos: Video[]
	comments: CommentWithMedia[]
	commentsTotal: number
	commentsPerPage: number
}

export type ProductReviewsResult = {
	reviews: ReviewWithMedia[]
	reviewsCount: number
}

export const getProductReviews = async ({
	productId,
	page,
	perPage,
}: {
	productId: string
	page: number
	perPage: number
}): Promise<ProductReviewsResult> => {
	const reviews = await prisma.review.findMany({
		skip: (page - 1) * perPage,
		take: perPage,
		orderBy: { createdAt: "desc" },
		where: { productId },
	})

	const reviewsCount = await prisma.review.count({ where: { productId } })

	const reviewIds = reviews.map((review) => review.id)

	if (reviewIds.length === 0) {
		return { reviews: [], reviewsCount }
	}

	const [commentsPerReview, commentsCounts, reviewImages, reviewVideos] =
		await Promise.all([
			Promise.all(
				reviewIds.map((reviewId) =>
					prisma.comment.findMany({
						where: {
							commentableId: reviewId,
							commentableType: CommentableType.REVIEW,
							deletedAt: null,
						},
						take: COMMENTS_PER_PAGE,
						orderBy: { createdAt: "desc" },
					})
				)
			),
			prisma.comment.groupBy({
				by: ["commentableId"],
				where: {
					commentableId: { in: reviewIds },
					commentableType: CommentableType.REVIEW,
					deletedAt: null,
				},
				_count: { _all: true },
			}),
			prisma.image.findMany({
				where: {
					imageableType: ImageableType.REVIEW,
					imageableId: { in: reviewIds },
				},
			}),
			prisma.video.findMany({
				where: {
					videoableType: VideoableType.REVIEW,
					videoableId: { in: reviewIds },
				},
			}),
		])

	const allComments = commentsPerReview.flat()
	const commentIds = allComments.map((comment) => comment.id)

	const [commentImages, commentVideos] = commentIds.length
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

	const reviewImagesByOwner = indexBy(reviewImages, (i) => i.imageableId)
	const reviewVideosByOwner = indexBy(reviewVideos, (v) => v.videoableId)
	const commentImagesByOwner = indexBy(commentImages, (i) => i.imageableId)
	const commentVideosByOwner = indexBy(commentVideos, (v) => v.videoableId)
	const commentsCountByReview = new Map(
		commentsCounts.map((c) => [c.commentableId, c._count._all])
	)

	return {
		reviews: reviews.map((review, i) => ({
			...review,
			images: reviewImagesByOwner.get(review.id) ?? [],
			videos: reviewVideosByOwner.get(review.id) ?? [],
			comments: (commentsPerReview[i] ?? []).map((comment) => ({
				...comment,
				images: commentImagesByOwner.get(comment.id) ?? [],
				videos: commentVideosByOwner.get(comment.id) ?? [],
			})),
			commentsTotal: commentsCountByReview.get(review.id) ?? 0,
			commentsPerPage: COMMENTS_PER_PAGE,
		})),
		reviewsCount,
	}
}
