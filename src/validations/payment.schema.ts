import { z } from "zod"

export const initializePaymentSchema = z.object({
	amount: z.number().int().positive(),
	currency: z.string().length(3).optional(),
	provider: z.enum(["paystack", "flutterwave"]),
	orderId: z.cuid2().optional(),
})

export const verifyPaymentSchema = z.object({
	reference: z.string().min(1),
})

export const webhookProviderSchema = z.object({
	provider: z.enum(["paystack", "flutterwave"]),
})

export type InitializePaymentInput = z.infer<typeof initializePaymentSchema>
export type VerifyPaymentParams = z.infer<typeof verifyPaymentSchema>
