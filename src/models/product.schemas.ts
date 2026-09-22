import { z } from "zod"

export const createProductSchema = z.object({
	name: z.string().trim().min(2).max(150),
	slug: z
		.string()
		.trim()
		.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
	description: z.string().trim().min(10).max(5000),
	price: z.number().int().nonnegative(),
	stock: z.number().int().nonnegative().default(0),
	imageUrl: z.string().url().optional(),
})

export const updateProductSchema = createProductSchema.partial()
