import { z } from "zod"

export const createReviewSchema = z.object({
	productId: z.uuid(),
	rating: z.number().int().min(1).max(5),
	title: z.string().trim().max(120).nullable().default(null),
	body: z.string().trim().max(5000).nullable().default(null),
})

export const updateReviewSchema = z.object({
	productId: z.uuid(),
	id: z.uuid(),
	rating: z.number().int().min(1).max(5),
	title: z.string().trim().max(120).nullable().default(null),
	body: z.string().trim().max(5000).nullable().default(null),
})

export const destroyReviewSchema = z.object({
	id: z.uuid(),
})
