export type PaymentProviderName = "paystack" | "flutterwave"

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

export interface PaymentGateway {
	readonly name: PaymentProviderName

	initializePayment(
		input: InitializePaymentInput
	): Promise<InitializePaymentResult>

	verifyPayment(reference: string): Promise<VerifyPaymentResult>

	parseWebhook(rawBody: Buffer, headers: WebhookHeaders): WebhookEvent
}
