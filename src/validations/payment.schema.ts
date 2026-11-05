import { z } from "zod"

export const initializePaymentSchema = z.object({
	provider: z.enum(["paystack", "flutterwave", "stripe"]),
	orderId: z.uuid(),
})

export const verifyPaymentSchema = z.object({
	reference: z.string().min(1),
})

export const webhookProviderSchema = z.object({
	provider: z.enum(["paystack", "flutterwave", "stripe"]),
})

export const refundPaymentSchema = z.object({
	reference: z.string().min(1),
})

export const refundBodySchema = z.object({
	amount: z.number().int().positive().optional(),
	reason: z.string().min(1).max(500).optional(),
})

export type InitializePaymentInput = z.infer<typeof initializePaymentSchema>
export type VerifyPaymentParams = z.infer<typeof verifyPaymentSchema>
export type RefundPaymentParams = z.infer<typeof refundPaymentSchema>
export type RefundBody = z.infer<typeof refundBodySchema>
