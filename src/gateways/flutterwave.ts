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

const FLW_API = "https://api.flutterwave.com/v3"

const mapStatus = (status: string): NormalizedPaymentStatus => {
	switch (status) {
		case "successful":
		case "success":
			return "success"
		case "failed":
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

export const createFlutterwaveGateway = (
	secretKey: string,
	webhookHash: string
): PaymentGateway => {
	const authHeaders = {
		Authorization: `Bearer ${secretKey}`,
		"Content-Type": "application/json",
	}

	const call = async <T>(
		path: string,
		init?: RequestInit
	): Promise<{ status: string; message: string; data: T }> => {
		const response = await fetch(`${FLW_API}${path}`, {
			...init,
			headers: { ...authHeaders, ...(init?.headers ?? {}) },
		})
		const body = (await response.json()) as {
			status: string
			message: string
			data: T
		}
		if (!response.ok || body.status !== "success") {
			throw new AppError(
				response.status || 502,
				`Flutterwave error: ${body.message ?? "unknown"}`
			)
		}
		return body
	}

	return {
		name: "flutterwave",

		async initializePayment(
			input: InitializePaymentInput
		): Promise<InitializePaymentResult> {
			const majorAmount = input.amount / 100

			const { data } = await call<{ link: string }>("/payments", {
				method: "POST",
				body: JSON.stringify({
					tx_ref: input.reference,
					amount: majorAmount,
					currency: input.currency,
					redirect_url: input.callbackUrl,
					customer: { email: input.email },
					meta: input.metadata,
				}),
			})

			return {
				authorizationUrl: data.link,
				providerReference: null,
				raw: data,
			}
		},

		async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
			const { data } = await call<{
				id: number
				flw_ref: string
				tx_ref: string
				status: string
				amount: number
				currency: string
			}>(
				`/transactions/verify_by_reference?tx_ref=${encodeURIComponent(
					reference
				)}`
			)

			return {
				status: mapStatus(data.status),
				amount: Math.round(data.amount * 100),
				currency: data.currency,
				providerReference: data.flw_ref ?? String(data.id),
				raw: data,
			}
		},

		parseWebhook(rawBody: Buffer, headers: WebhookHeaders): WebhookEvent {
			const sent = headerValue(headers, "verif-hash")
			if (!sent) {
				throw new AppError(401, "Missing Flutterwave verif-hash")
			}
			if (sent !== webhookHash) {
				throw new AppError(401, "Invalid Flutterwave verif-hash")
			}

			const payload = JSON.parse(rawBody.toString("utf8")) as {
				event: string
				data: {
					id: number
					tx_ref: string
					flw_ref: string
					status: string
					amount: number
					currency: string
				}
			}

			return {
				eventId: String(payload.data.id),
				reference: payload.data.tx_ref,
				status: mapStatus(payload.data.status),
				amount: Math.round(payload.data.amount * 100),
				currency: payload.data.currency,
				providerReference:
					payload.data.flw_ref ?? String(payload.data.id),
				raw: payload,
			}
		},
	}
}
