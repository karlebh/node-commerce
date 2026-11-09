import { z } from "zod"
import { urlQuerySchema } from "./url-query.schema.js"

export const indexReviewCommentsSchema = urlQuerySchema.extend({
	parentId: z.uuid().optional(),
	topLevelOnly: z
		.enum(["true", "false"])
		.optional()
		.transform((v) => v === "true"),
})

export const createReviewCommentSchema = z.object({
	body: z.string().trim().min(1).max(5000),
	parentId: z.uuid().optional(),
})

export const updateReviewCommentSchema = z.object({
	body: z.string().trim().min(1).max(5000),
})

export const reviewIdParamSchema = z.object({
	reviewId: z.uuid(),
})

export const commentIdParamSchema = z.object({
	id: z.uuid(),
})

export const reviewCommentParamsSchema = z.object({
	reviewId: z.uuid(),
	id: z.uuid(),
})
