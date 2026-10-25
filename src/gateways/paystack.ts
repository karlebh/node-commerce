import { createHmac, timingSafeEqual } from "node:crypto"
import { AppError } from "../errors/AppError.js"
import type {
	InitializePaymentInput,
	InitializePaymentResult,
	NormalizedPaymentStatus,
	PaymentGateway,
	VerifyPaymentResult,
	WebhookEvent,
	WebhookHeaders,
} from "../interfaces/payment-gateway.interface.js"

const PAYSTACK_API = "https://api.paystack.co"

const mapStatus = (status: string): NormalizedPaymentStatus => {
	switch (status) {
		case "success":
			return "success"
		case "failed":
		case "reversed":
			return "failed"
		case "abandoned":
			return "abandoned"
		default:
			return "pending"
	}
}

const headerValue = (headers: WebhookHeaders, key: string): string | null => {
	const raw = headers[key] ?? headers[key.toLowerCase()]
	if (Array.isArray(raw)) return raw[0] ?? null
	return typeof raw === "string" ? raw : null
}

export const createPaystackGateway = (secretKey: string): PaymentGateway => {
	const authHeaders = {
		Authorization: `Bearer ${secretKey}`,
		"Content-Type": "application/json",
	}

	const call = async <T>(
		path: string,
		init?: RequestInit
	): Promise<{ status: boolean; message: string; data: T }> => {
		const response = await fetch(`${PAYSTACK_API}${path}`, {
			...init,
			headers: { ...authHeaders, ...(init?.headers ?? {}) },
		})
		const body = (await response.json()) as {
			status: boolean
			message: string
			data: T
		}
		if (!response.ok || !body.status) {
			throw new AppError(
				response.status || 502,
				`Paystack error: ${body.message ?? "unknown"}`
			)
		}
		return body
	}

	return {
		name: "paystack",

		async initializePayment(
			input: InitializePaymentInput
		): Promise<InitializePaymentResult> {
			const { data } = await call<{
				authorization_url: string
				access_code: string
				reference: string
			}>("/transaction/initialize", {
				method: "POST",
				body: JSON.stringify({
					email: input.email,
					amount: input.amount,
					currency: input.currency,
					reference: input.reference,
					callback_url: input.callbackUrl,
					metadata: input.metadata,
				}),
			})

			return {
				authorizationUrl: data.authorization_url,
				providerReference: data.reference ?? null,
				raw: data,
			}
		},

		async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
			const { data } = await call<{
				id: number
				status: string
				amount: number
				currency: string
				reference: string
			}>(`/transaction/verify/${encodeURIComponent(reference)}`)

			return {
				status: mapStatus(data.status),
				amount: data.amount,
				currency: data.currency,
				providerReference: String(data.id),
				raw: data,
			}
		},

		parseWebhook(rawBody: Buffer, headers: WebhookHeaders): WebhookEvent {
			const signature = headerValue(headers, "x-paystack-signature")
			if (!signature) {
				throw new AppError(401, "Missing Paystack signature")
			}

			const expected = createHmac("sha512", secretKey)
				.update(rawBody)
				.digest("hex")

			const a = Buffer.from(expected, "hex")
			const b = Buffer.from(signature, "hex")
			if (a.length !== b.length || !timingSafeEqual(a, b)) {
				throw new AppError(401, "Invalid Paystack signature")
			}

			const payload = JSON.parse(rawBody.toString("utf8")) as {
				event: string
				data: {
					id: number
					reference: string
					amount: number
					currency: string
					status: string
				}
			}

			return {
				eventId: String(payload.data.id),
				reference: payload.data.reference,
				status: mapStatus(payload.data.status),
				amount: payload.data.amount,
				currency: payload.data.currency,
				providerReference: String(payload.data.id),
				raw: payload,
			}
		},
	}
}
