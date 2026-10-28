import axios, { AxiosError, type AxiosInstance } from "axios"
import { createHmac, timingSafeEqual } from "node:crypto"
import { AppError } from "../errors/AppError.js"
import { headerValue } from "../helpers/index.js"
import type {
	InitializePaymentInput,
	InitializePaymentResult,
	NormalizedPaymentStatus,
	PaymentGateway,
	VerifyPaymentResult,
	WebhookEvent,
	WebhookHeaders,
} from "../types/payment.js"

const STRIPE_API = "https://api.stripe.com/v1"
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60

type StripeSession = {
	id: string
	url: string | null
	amount_total: number | null
	currency: string | null
	client_reference_id: string | null
	payment_intent: string | null
	payment_status: "paid" | "unpaid" | "no_payment_required"
	status: "open" | "complete" | "expired"
}

type StripeSearchResult = { data: StripeSession[] }

const mapStatus = (
	eventType: string,
	session?: Pick<StripeSession, "payment_status" | "status">
): NormalizedPaymentStatus => {
	if (
		eventType === "checkout.session.completed" ||
		eventType === "checkout.session.async_payment_succeeded" ||
		eventType === "payment_intent.succeeded"
	) {
		if (session && session.payment_status !== "paid") return "pending"
		return "success"
	}
	if (
		eventType === "checkout.session.async_payment_failed" ||
		eventType === "payment_intent.payment_failed" ||
		eventType === "charge.failed"
	) {
		return "failed"
	}
	if (eventType === "checkout.session.expired") return "abandoned"
	if (session?.status === "complete" && session.payment_status === "paid") {
		return "success"
	}
	if (session?.status === "expired") return "abandoned"
	return "pending"
}

const parseStripeSignature = (
	header: string
): { timestamp: number; signatures: string[] } => {
	const parts = header.split(",")

	let timestamp = 0
	const signatures: string[] = []
	for (const part of parts) {
		const [key, value] = part.split("=")
		if (!key || !value) continue
		if (key === "t") timestamp = Number.parseInt(value, 10)
		else if (key === "v1") signatures.push(value)
	}
	return { timestamp, signatures }
}

export const createStripeGateway = (
	secretKey: string,
	webhookSecret: string
): PaymentGateway => {
	const client: AxiosInstance = axios.create({
		baseURL: STRIPE_API,
		headers: {
			Authorization: `Bearer ${secretKey}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
	})

	const call = async <T>(
		path: string,
		config?: { method?: "GET" | "POST"; body?: URLSearchParams }
	): Promise<T> => {
		try {
			const response = await client.request<T>({
				url: path,
				method: config?.method ?? "GET",
				data: config?.body?.toString(),
			})
			return response.data
		} catch (error) {
			if (error instanceof AppError) throw error
			if (error instanceof AxiosError) {
				const body = error.response?.data as
					| { error?: { message?: string } }
					| undefined
				throw new AppError(
					error.response?.status || 502,
					`Stripe error: ${body?.error?.message ?? error.message}`
				)
			}
			throw error
		}
	}

	return {
		name: "stripe",

		async initializePayment(
			input: InitializePaymentInput
		): Promise<InitializePaymentResult> {
			const body = new URLSearchParams()
			body.set("mode", "payment")
			body.set("success_url", input.callbackUrl)
			body.set("cancel_url", input.callbackUrl)
			body.set("client_reference_id", input.reference)
			body.set("customer_email", input.email)
			body.set(
				"line_items[0][price_data][currency]",
				input.currency.toLowerCase()
			)
			body.set(
				"line_items[0][price_data][product_data][name]",
				`Order ${input.reference}`
			)
			body.set(
				"line_items[0][price_data][unit_amount]",
				String(input.amount)
			)
			body.set("line_items[0][quantity]", "1")
			if (input.metadata) {
				for (const [key, value] of Object.entries(input.metadata)) {
					body.set(`metadata[${key}]`, String(value))
				}
			}

			const session = await call<StripeSession>("/checkout/sessions", {
				method: "POST",
				body,
			})

			if (!session.url) {
				throw new AppError(502, "Stripe did not return a checkout URL")
			}

			return {
				authorizationUrl: session.url,
				providerReference: session.id,
				raw: session,
			}
		},

		async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
			const query = encodeURIComponent(
				`client_reference_id:"${reference}"`
			)
			const result = await call<StripeSearchResult>(
				`/checkout/sessions/search?query=${query}&limit=1`
			)
			const session = result.data[0]
			if (!session) {
				throw new AppError(
					404,
					`Stripe session not found for reference ${reference}`
				)
			}

			return {
				status: mapStatus("", session),
				amount: session.amount_total ?? 0,
				currency: (session.currency ?? "usd").toUpperCase(),
				providerReference: session.payment_intent ?? session.id,
				raw: session,
			}
		},

		parseWebhook(rawBody: Buffer, headers: WebhookHeaders): WebhookEvent {
			const signatureHeader = headerValue(headers, "stripe-signature")
			if (!signatureHeader) {
				throw new AppError(401, "Missing Stripe-Signature header")
			}
			const { timestamp, signatures } =
				parseStripeSignature(signatureHeader)
			if (!timestamp || signatures.length === 0) {
				throw new AppError(401, "Malformed Stripe-Signature header")
			}

			const nowSeconds = Math.floor(Date.now() / 1000)
			if (
				Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS
			) {
				throw new AppError(
					401,
					"Stripe signature timestamp outside tolerance"
				)
			}

			const signedPayload = `${timestamp}.${rawBody.toString("utf8")}`
			const expected = createHmac("sha256", webhookSecret)
				.update(signedPayload)
				.digest("hex")
			const expectedBuf = Buffer.from(expected, "hex")

			const matched = signatures.some((sig) => {
				const sigBuf = Buffer.from(sig, "hex")
				return (
					sigBuf.length === expectedBuf.length &&
					timingSafeEqual(sigBuf, expectedBuf)
				)
			})
			if (!matched) {
				throw new AppError(401, "Invalid Stripe signature")
			}

			const payload = JSON.parse(rawBody.toString("utf8")) as {
				id: string
				type: string
				data: {
					object: StripeSession & {
						metadata?: Record<string, string>
					}
				}
			}

			const session = payload.data.object
			if (!session.client_reference_id) {
				throw new AppError(
					400,
					"Stripe event missing client_reference_id"
				)
			}

			return {
				eventId: payload.id,
				reference: session.client_reference_id,
				status: mapStatus(payload.type, session),
				amount: session.amount_total ?? 0,
				currency: (session.currency ?? "usd").toUpperCase(),
				providerReference: session.payment_intent ?? session.id,
				raw: payload,
			}
		},
	}
}
