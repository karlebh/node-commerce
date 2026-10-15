import { cuid2, z } from "zod"

export const createProductSchema = z.object({
	name: z.string().trim().min(2).max(150),
	description: z.string().trim().min(10).max(5000),
	price: z.number().int().nonnegative(),
	stock: z.number().int().nonnegative().default(0),
	imageUrl: z.string().url().optional(),
	categoryId: z.string(),
})

export const updateProductSchema = z.object({
	name: z.string().trim().min(2).max(150).optional(),
	description: z.string().trim().min(10).max(5000).optional(),
	price: z.number().nonnegative().optional(),
	stock: z.number().int().nonnegative().optional(),
	imageUrl: z.string().url().optional(),
	categoryId: z.string().optional(),
})

export const productParamSchema = z.object({
	id: cuid2(),
})
