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

const { createPaystackGateway } = await import(
	"../../../src/gateways/paystack.js"
)

const SECRET = "sk_test_secret"
const sign = (body: Buffer): string =>
	createHmac("sha512", SECRET).update(body).digest("hex")

describe("paystack gateway", () => {
	beforeEach(() => {
		mockRequest.mockReset()
	})

	describe("initializePayment", () => {
		it("posts the expected body and returns authorization url", async () => {
			mockRequest.mockResolvedValue({
				status: 200,
				data: {
					status: true,
					message: "ok",
					data: {
						authorization_url: "https://pay.example/authorize",
						access_code: "access_1",
						reference: "ref-provider",
					},
				},
			})

			const gateway = createPaystackGateway(SECRET)
			const result = await gateway.initializePayment({
				email: "buyer@example.test",
				amount: 2500,
				currency: "NGN",
				reference: "ref-local",
				callbackUrl: "https://example.test/callback",
				metadata: { orderId: "o-1" },
			})

			expect(result.authorizationUrl).toBe("https://pay.example/authorize")
			expect(result.providerReference).toBe("ref-provider")
			const call = mockRequest.mock.calls[0]?.[0] as AxiosRequestConfig
			expect(call?.url).toBe("/transaction/initialize")
			expect(call?.method).toBe("POST")
			expect(call?.data).toEqual({
				email: "buyer@example.test",
				amount: 2500,
				currency: "NGN",
				reference: "ref-local",
				callback_url: "https://example.test/callback",
				metadata: { orderId: "o-1" },
			})
		})

		it("wraps Paystack {status:false} responses as AppError", async () => {
			mockRequest.mockResolvedValue({
				status: 400,
				data: { status: false, message: "invalid key", data: null },
			})

			const gateway = createPaystackGateway(SECRET)
			await expect(
				gateway.initializePayment({
					email: "buyer@example.test",
					amount: 2500,
					currency: "NGN",
					reference: "ref-local",
					callbackUrl: "https://example.test/callback",
				})
			).rejects.toMatchObject({
				statusCode: 400,
				message: "Paystack error: invalid key",
			})
		})

		it("surfaces AxiosError responses as AppError", async () => {
			const err = new AxiosError("boom")
			// biome-ignore lint: constructed-after
			;(err as unknown as { response: unknown }).response = {
				status: 503,
				data: { status: false, message: "upstream down" },
			}
			mockRequest.mockRejectedValue(err)

			const gateway = createPaystackGateway(SECRET)
			await expect(
				gateway.initializePayment({
					email: "buyer@example.test",
					amount: 2500,
					currency: "NGN",
					reference: "ref-local",
					callbackUrl: "https://example.test/callback",
				})
			).rejects.toMatchObject({
				statusCode: 503,
				message: "Paystack error: upstream down",
			})
		})
	})

	describe("verifyPayment", () => {
		it("maps success status and encodes the reference", async () => {
			mockRequest.mockResolvedValue({
				status: 200,
				data: {
					status: true,
					message: "ok",
					data: {
						id: 42,
						status: "success",
						amount: 2500,
						currency: "NGN",
						reference: "ref/with slash",
					},
				},
			})

			const gateway = createPaystackGateway(SECRET)
			const result = await gateway.verifyPayment("ref/with slash")

			expect(result).toMatchObject({
				status: "success",
				amount: 2500,
				currency: "NGN",
				providerReference: "42",
			})
			const call = mockRequest.mock.calls[0]?.[0] as AxiosRequestConfig
			expect(call?.url).toBe("/transaction/verify/ref%2Fwith%20slash")
		})

		it.each([
			["failed", "failed"],
			["reversed", "failed"],
			["abandoned", "abandoned"],
			["pending", "pending"],
			["something-unknown", "pending"],
		])("maps status %s to %s", async (upstream, normalized) => {
			mockRequest.mockResolvedValue({
				status: 200,
				data: {
					status: true,
					message: "ok",
					data: {
						id: 1,
						status: upstream,
						amount: 100,
						currency: "NGN",
						reference: "r",
					},
				},
			})

			const gateway = createPaystackGateway(SECRET)
			const result = await gateway.verifyPayment("r")
			expect(result.status).toBe(normalized)
		})
	})

	describe("parseWebhook", () => {
		const buildPayload = (overrides: Record<string, unknown> = {}) =>
			Buffer.from(
				JSON.stringify({
					event: "charge.success",
					data: {
						id: 99,
						reference: "ref-local",
						amount: 2500,
						currency: "NGN",
						status: "success",
						...overrides,
					},
				})
			)

		it("rejects when signature header is missing", () => {
			const gateway = createPaystackGateway(SECRET)
			expect(() => gateway.parseWebhook(buildPayload(), {})).toThrow(
				/Missing Paystack signature/
			)
		})

		it("rejects when signatures have different byte lengths", () => {
			const gateway = createPaystackGateway(SECRET)
			expect(() =>
				gateway.parseWebhook(buildPayload(), {
					"x-paystack-signature": "abcd",
				})
			).toThrow(/Invalid Paystack signature/)
		})

		it("rejects when signature is same length but wrong", () => {
			const body = buildPayload()
			const forged = sign(Buffer.from("tampered"))
			const gateway = createPaystackGateway(SECRET)
			expect(() =>
				gateway.parseWebhook(body, { "x-paystack-signature": forged })
			).toThrow(/Invalid Paystack signature/)
		})

		it("accepts a valid signature and normalizes the event", () => {
			const body = buildPayload()
			const gateway = createPaystackGateway(SECRET)
			const event = gateway.parseWebhook(body, {
				"x-paystack-signature": sign(body),
			})

			expect(event).toMatchObject({
				eventId: "99",
				reference: "ref-local",
				status: "success",
				amount: 2500,
				currency: "NGN",
				providerReference: "99",
			})
		})

	})
})
