import { z } from "zod"
import type { urlQuerySchema } from "./url-query.schema.js"

export const createCategorySchema = z.object({
	name: z.string().trim().min(2).max(100),
})

export const updateCategorySchema = createCategorySchema.partial()

export const categoryParamsSchema = z.object({
	id: z.string().cuid(),
})

export type CreateCategoryInput = z.infer<typeof createCategorySchema>
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>
export type CategoryParams = z.infer<typeof categoryParamsSchema>
export type CategoryQuery = z.infer<typeof urlQuerySchema>
