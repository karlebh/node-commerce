import { createHmac } from "node:crypto"
import { AxiosError, type AxiosRequestConfig } from "axios"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockRequest } = vi.hoisted(() => ({
	mockRequest: vi.fn(),
}))

vi.mock("axios", async () => {
	const actual = await vi.importActual<typeof import("axios")>("axios")
	return {
		...actual,
		default: {
			...actual.default,
			create: vi.fn(() => ({ request: mockRequest })),
		},
	}
})

const { createStripeGateway } = await import("../../../src/gateways/stripe.js")

const SECRET = "sk_test_stripe"
const WEBHOOK_SECRET = "whsec_test"

const signStripe = (
	payload: string,
	secret: string,
	timestamp: number
): string => {
	const signature = createHmac("sha256", secret)
		.update(`${timestamp}.${payload}`)
		.digest("hex")
	return `t=${timestamp},v1=${signature}`
}

describe("stripe gateway", () => {
	beforeEach(() => {
		mockRequest.mockReset()
	})

	describe("initializePayment", () => {
		it("sends an urlencoded checkout session body and returns the url", async () => {
			mockRequest.mockResolvedValue({
				status: 200,
				data: {
					id: "cs_test_1",
					url: "https://checkout.stripe/sess_1",
					amount_total: 2500,
					currency: "usd",
					client_reference_id: "ref-local",
					payment_intent: null,
					payment_status: "unpaid",
					status: "open",
				},
			})

			const gateway = createStripeGateway(SECRET, WEBHOOK_SECRET)
			const result = await gateway.initializePayment({
				email: "buyer@example.test",
				amount: 2500,
				currency: "USD",
				reference: "ref-local",
				callbackUrl: "https://example.test/callback",
				metadata: { orderId: "o-1" },
			})

			expect(result.authorizationUrl).toBe(
				"https://checkout.stripe/sess_1"
			)
			expect(result.providerReference).toBe("cs_test_1")

			const call = mockRequest.mock.calls[0]?.[0] as AxiosRequestConfig
			expect(call?.url).toBe("/checkout/sessions")
			expect(call?.method).toBe("POST")
			const body = new URLSearchParams(String(call?.data))
			expect(body.get("mode")).toBe("payment")
			expect(body.get("success_url")).toBe(
				"https://example.test/callback"
			)
			expect(body.get("cancel_url")).toBe(
				"https://example.test/callback"
			)
			expect(body.get("client_reference_id")).toBe("ref-local")
			expect(body.get("customer_email")).toBe("buyer@example.test")
			expect(body.get("line_items[0][price_data][currency]")).toBe("usd")
			expect(body.get("line_items[0][price_data][unit_amount]")).toBe(
				"2500"
			)
			expect(body.get("line_items[0][quantity]")).toBe("1")
			expect(body.get("metadata[orderId]")).toBe("o-1")
		})

		it("throws when Stripe omits a checkout url", async () => {
			mockRequest.mockResolvedValue({
				status: 200,
				data: {
					id: "cs_test_1",
					url: null,
					amount_total: 2500,
					currency: "usd",
					client_reference_id: "ref-local",
					payment_intent: null,
					payment_status: "unpaid",
					status: "open",
				},
			})

			const gateway = createStripeGateway(SECRET, WEBHOOK_SECRET)
			await expect(
				gateway.initializePayment({
					email: "buyer@example.test",
					amount: 2500,
					currency: "USD",
					reference: "ref-local",
					callbackUrl: "https://example.test/callback",
				})
			).rejects.toMatchObject({
				statusCode: 502,
				message: "Stripe did not return a checkout URL",
			})
		})

		it("wraps axios errors into AppError", async () => {
			const err = new AxiosError("bad")
			;(err as unknown as { response: unknown }).response = {
				status: 400,
				data: { error: { message: "invalid currency" } },
			}
			mockRequest.mockRejectedValue(err)

			const gateway = createStripeGateway(SECRET, WEBHOOK_SECRET)
			await expect(
				gateway.initializePayment({
					email: "buyer@example.test",
					amount: 2500,
					currency: "USD",
					reference: "ref-local",
					callbackUrl: "https://example.test/callback",
				})
			).rejects.toMatchObject({
				statusCode: 400,
				message: "Stripe error: invalid currency",
			})
		})
	})

	describe("verifyPayment", () => {
		it("returns success for a paid completed session", async () => {
			mockRequest.mockResolvedValue({
				status: 200,
				data: {
					data: [
						{
							id: "cs_test_1",
							url: null,
							amount_total: 2500,
							currency: "usd",
							client_reference_id: "ref-local",
							payment_intent: "pi_1",
							payment_status: "paid",
							status: "complete",
						},
					],
				},
			})

			const gateway = createStripeGateway(SECRET, WEBHOOK_SECRET)
			const result = await gateway.verifyPayment("ref-local")

			expect(result).toMatchObject({
				status: "success",
				amount: 2500,
				currency: "USD",
				providerReference: "pi_1",
			})
			const call = mockRequest.mock.calls[0]?.[0] as AxiosRequestConfig
			expect(call?.url).toContain(
				encodeURIComponent('client_reference_id:"ref-local"')
			)
		})

		it("throws 404 when no matching session is found", async () => {
			mockRequest.mockResolvedValue({
				status: 200,
				data: { data: [] },
			})

			const gateway = createStripeGateway(SECRET, WEBHOOK_SECRET)
			await expect(gateway.verifyPayment("ref-local")).rejects.toMatchObject(
				{
					statusCode: 404,
					message: /Stripe session not found/,
				}
			)
		})

		it("falls back to session id when payment_intent is missing", async () => {
			mockRequest.mockResolvedValue({
				status: 200,
				data: {
					data: [
						{
							id: "cs_test_1",
							url: null,
							amount_total: 1000,
							currency: "usd",
							client_reference_id: "ref-local",
							payment_intent: null,
							payment_status: "paid",
							status: "complete",
						},
					],
				},
			})

			const gateway = createStripeGateway(SECRET, WEBHOOK_SECRET)
			const result = await gateway.verifyPayment("ref-local")
			expect(result.providerReference).toBe("cs_test_1")
		})

		it("marks expired sessions as abandoned", async () => {
			mockRequest.mockResolvedValue({
				status: 200,
				data: {
					data: [
						{
							id: "cs_test_1",
							url: null,
							amount_total: 2500,
							currency: "usd",
							client_reference_id: "ref-local",
							payment_intent: null,
							payment_status: "unpaid",
							status: "expired",
						},
					],
				},
			})

			const gateway = createStripeGateway(SECRET, WEBHOOK_SECRET)
			const result = await gateway.verifyPayment("ref-local")
			expect(result.status).toBe("abandoned")
		})
	})

	describe("parseWebhook", () => {
		const nowSeconds = () => Math.floor(Date.now() / 1000)
		const buildBody = (overrides: Record<string, unknown> = {}) =>
			Buffer.from(
				JSON.stringify({
					id: "evt_1",
					type: "checkout.session.completed",
					data: {
						object: {
							id: "cs_test_1",
							url: null,
							amount_total: 2500,
							currency: "usd",
							client_reference_id: "ref-local",
							payment_intent: "pi_1",
							payment_status: "paid",
							status: "complete",
							...overrides,
						},
					},
				})
			)

		it("rejects when stripe-signature is missing", () => {
			const gateway = createStripeGateway(SECRET, WEBHOOK_SECRET)
			expect(() => gateway.parseWebhook(buildBody(), {})).toThrow(
				/Missing Stripe-Signature/
			)
		})

		it("rejects malformed signature header", () => {
			const gateway = createStripeGateway(SECRET, WEBHOOK_SECRET)
			expect(() =>
				gateway.parseWebhook(buildBody(), {
					"stripe-signature": "nonsense",
				})
			).toThrow(/Malformed Stripe-Signature/)
		})

		it("rejects signature timestamps outside tolerance", () => {
			const body = buildBody()
			const old = nowSeconds() - 60 * 60 // 1 hour ago
			const gateway = createStripeGateway(SECRET, WEBHOOK_SECRET)
			expect(() =>
				gateway.parseWebhook(body, {
					"stripe-signature": signStripe(
						body.toString("utf8"),
						WEBHOOK_SECRET,
						old
					),
				})
			).toThrow(/outside tolerance/)
		})

		it("rejects signatures computed with the wrong secret", () => {
			const body = buildBody()
			const ts = nowSeconds()
			const gateway = createStripeGateway(SECRET, WEBHOOK_SECRET)
			expect(() =>
				gateway.parseWebhook(body, {
					"stripe-signature": signStripe(
						body.toString("utf8"),
						"wrong-secret",
						ts
					),
				})
			).toThrow(/Invalid Stripe signature/)
		})

		it("rejects events missing client_reference_id", () => {
			const body = buildBody({ client_reference_id: null })
			const ts = nowSeconds()
			const gateway = createStripeGateway(SECRET, WEBHOOK_SECRET)
			expect(() =>
				gateway.parseWebhook(body, {
					"stripe-signature": signStripe(
						body.toString("utf8"),
						WEBHOOK_SECRET,
						ts
					),
				})
			).toThrow(/missing client_reference_id/)
		})

		it("maps a paid checkout.session.completed to success", () => {
			const body = buildBody()
			const ts = nowSeconds()
			const gateway = createStripeGateway(SECRET, WEBHOOK_SECRET)
			const event = gateway.parseWebhook(body, {
				"stripe-signature": signStripe(
					body.toString("utf8"),
					WEBHOOK_SECRET,
					ts
				),
			})

			expect(event).toMatchObject({
				eventId: "evt_1",
				reference: "ref-local",
				status: "success",
				amount: 2500,
				currency: "USD",
				providerReference: "pi_1",
			})
		})

		it("maps an unpaid completed session to pending", () => {
			const body = buildBody({ payment_status: "unpaid" })
			const ts = nowSeconds()
			const gateway = createStripeGateway(SECRET, WEBHOOK_SECRET)
			const event = gateway.parseWebhook(body, {
				"stripe-signature": signStripe(
					body.toString("utf8"),
					WEBHOOK_SECRET,
					ts
				),
			})
			expect(event.status).toBe("pending")
		})

		it.each([
			["checkout.session.async_payment_failed", "failed"],
			["payment_intent.payment_failed", "failed"],
			["charge.failed", "failed"],
			["checkout.session.expired", "abandoned"],
		])("maps event type %s to %s", (type, expected) => {
			const payload = JSON.stringify({
				id: "evt_1",
				type,
				data: {
					object: {
						id: "cs_test_1",
						url: null,
						amount_total: 2500,
						currency: "usd",
						client_reference_id: "ref-local",
						payment_intent: "pi_1",
						payment_status: "unpaid",
						status: "open",
					},
				},
			})
			const body = Buffer.from(payload)
			const ts = nowSeconds()
			const gateway = createStripeGateway(SECRET, WEBHOOK_SECRET)
			const event = gateway.parseWebhook(body, {
				"stripe-signature": signStripe(payload, WEBHOOK_SECRET, ts),
			})
			expect(event.status).toBe(expected)
		})

		it("accepts multiple v1 signatures and takes the matching one", () => {
			const body = buildBody()
			const ts = nowSeconds()
			const good = createHmac("sha256", WEBHOOK_SECRET)
				.update(`${ts}.${body.toString("utf8")}`)
				.digest("hex")
			const header = `t=${ts},v1=${"0".repeat(good.length)},v1=${good}`

			const gateway = createStripeGateway(SECRET, WEBHOOK_SECRET)
			expect(() =>
				gateway.parseWebhook(body, { "stripe-signature": header })
			).not.toThrow()
		})
	})
})
