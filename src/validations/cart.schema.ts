import { z } from "zod"

export const createCartSchema = z.object({
	productId: z.uuid(),
	quantity: z.number().int().min(1).max(99).default(1),
})

export const destroyCartSchema = z.object({
	id: z.uuid(),
})
