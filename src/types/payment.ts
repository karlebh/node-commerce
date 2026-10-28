import type { Payment, Prisma } from "@prisma/client"

export type PaymentProviderName = "paystack" | "flutterwave" | "stripe"

export type NormalizedPaymentStatus =
	| "success"
	| "failed"
	| "pending"
	| "abandoned"

export type InitializePaymentInput = {
	email: string
	amount: number
	currency: string
	reference: string
	callbackUrl: string
	metadata?: Record<string, unknown>
}

export type InitializePaymentResult = {
	authorizationUrl: string
	providerReference: string | null
	raw: unknown
}

export type VerifyPaymentResult = {
	status: NormalizedPaymentStatus
	amount: number
	currency: string
	providerReference: string
	raw: unknown
}

export type WebhookEvent = {
	eventId: string
	reference: string
	status: NormalizedPaymentStatus
	amount: number
	currency: string
	providerReference: string
	raw: unknown
}

export type WebhookHeaders = Record<string, string | string[] | undefined>

export type InitializePaymentArgs = {
	userId: string
	email: string
	amount: number
	currency?: string | undefined
	provider: PaymentProviderName
	orderId?: string | undefined
	metadata?: Record<string, unknown> | undefined
}

export type InitializePaymentResponse = {
	authorizationUrl: string
	reference: string
	payment: Payment
}

export type PaymentOutcomeArgs = {
	payment: Payment
	status: Payment["status"]
	providerReference: string
	amount: number
	currency: string
	rawVerify: Prisma.InputJsonValue
}

export interface PaymentGateway {
	readonly name: PaymentProviderName

	initializePayment(
		input: InitializePaymentInput
	): Promise<InitializePaymentResult>

	verifyPayment(reference: string): Promise<VerifyPaymentResult>

	parseWebhook(rawBody: Buffer, headers: WebhookHeaders): WebhookEvent
}
