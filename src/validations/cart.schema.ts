import { z } from "zod"

export const createCartSchema = z.object({
	productId: z.cuid2(),
	quantity: z.number().int().min(1).max(99).default(1),
})

export const destroyCartSchema = z.object({
	cartItemId: z.cuid2(),
})
