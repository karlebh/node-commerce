import { z } from "zod"

export const discountCodeSchema = z
	.string()
	.trim()
	.min(3)
	.max(50)
	.regex(/^[A-Za-z0-9_-]+$/, "Code must be letters, digits, _ or -")
	.transform((code) => code.toUpperCase())

export const createDiscountSchema = z
	.object({
		code: discountCodeSchema,
		description: z.string().trim().max(500).optional(),
		type: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
		value: z.number().int().positive(),
		minOrderAmount: z.number().int().nonnegative().optional(),
		maxDiscountAmount: z.number().int().positive().optional(),
		usageLimit: z.number().int().positive().optional(),
		startsAt: z.coerce.date().optional(),
		expiresAt: z.coerce.date().optional(),
		isActive: z.boolean().default(true),
	})
	.refine(
		(data) => data.type !== "PERCENTAGE" || data.value <= 100,
		{ message: "PERCENTAGE value must be between 1 and 100", path: ["value"] }
	)
	.refine(
		(data) =>
			!data.startsAt || !data.expiresAt || data.startsAt < data.expiresAt,
		{ message: "expiresAt must be after startsAt", path: ["expiresAt"] }
	)

export const updateDiscountSchema = z
	.object({
		code: discountCodeSchema.optional(),
		description: z.string().trim().max(500).optional(),
		type: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]).optional(),
		value: z.number().int().positive().optional(),
		minOrderAmount: z.number().int().nonnegative().nullable().optional(),
		maxDiscountAmount: z.number().int().positive().nullable().optional(),
		usageLimit: z.number().int().positive().nullable().optional(),
		startsAt: z.coerce.date().nullable().optional(),
		expiresAt: z.coerce.date().nullable().optional(),
		isActive: z.boolean().optional(),
	})
	.refine(
		(data) =>
			data.type !== "PERCENTAGE" ||
			data.value === undefined ||
			data.value <= 100,
		{ message: "PERCENTAGE value must be between 1 and 100", path: ["value"] }
	)

export const discountParamsSchema = z.object({
	id: z.uuid(),
})

export const applyDiscountSchema = z.object({
	code: discountCodeSchema,
})

export type CreateDiscountInput = z.infer<typeof createDiscountSchema>
export type UpdateDiscountInput = z.infer<typeof updateDiscountSchema>
export type DiscountParams = z.infer<typeof discountParamsSchema>
export type ApplyDiscountInput = z.infer<typeof applyDiscountSchema>
