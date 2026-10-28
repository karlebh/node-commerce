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

const { createFlutterwaveGateway } = await import(
	"../../../src/gateways/flutterwave.js"
)

const SECRET = "FLWSECK_TEST-secret"
const HASH = "verif-hash-value"

describe("flutterwave gateway", () => {
	beforeEach(() => {
		mockRequest.mockReset()
	})

	describe("initializePayment", () => {
		it("sends amount in major units and returns the hosted link", async () => {
			mockRequest.mockResolvedValue({
				status: 200,
				data: {
					status: "success",
					message: "ok",
					data: { link: "https://pay.flutterwave/authorize" },
				},
			})

			const gateway = createFlutterwaveGateway(SECRET, HASH)
			const result = await gateway.initializePayment({
				email: "buyer@example.test",
				amount: 2500, // minor units
				currency: "NGN",
				reference: "ref-local",
				callbackUrl: "https://example.test/callback",
				metadata: { orderId: "o-1" },
			})

			expect(result.authorizationUrl).toBe(
				"https://pay.flutterwave/authorize"
			)
			expect(result.providerReference).toBeNull()
			const call = mockRequest.mock.calls[0]?.[0] as AxiosRequestConfig
			expect(call?.url).toBe("/payments")
			expect(call?.data).toEqual({
				tx_ref: "ref-local",
				amount: 25, // 2500 / 100
				currency: "NGN",
				redirect_url: "https://example.test/callback",
				customer: { email: "buyer@example.test" },
				meta: { orderId: "o-1" },
			})
		})

		it("wraps non-success Flutterwave responses as AppError", async () => {
			mockRequest.mockResolvedValue({
				status: 400,
				data: {
					status: "error",
					message: "invalid tx_ref",
					data: null,
				},
			})

			const gateway = createFlutterwaveGateway(SECRET, HASH)
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
				message: "Flutterwave error: invalid tx_ref",
			})
		})

		it("surfaces AxiosError responses as AppError", async () => {
			const err = new AxiosError("timeout")
			;(err as unknown as { response: unknown }).response = {
				status: 504,
				data: { status: "error", message: "gateway timeout" },
			}
			mockRequest.mockRejectedValue(err)

			const gateway = createFlutterwaveGateway(SECRET, HASH)
			await expect(
				gateway.initializePayment({
					email: "buyer@example.test",
					amount: 2500,
					currency: "NGN",
					reference: "ref-local",
					callbackUrl: "https://example.test/callback",
				})
			).rejects.toMatchObject({
				statusCode: 504,
				message: "Flutterwave error: gateway timeout",
			})
		})
	})

	describe("verifyPayment", () => {
		it("converts amount to minor units and prefers flw_ref", async () => {
			mockRequest.mockResolvedValue({
				status: 200,
				data: {
					status: "success",
					message: "ok",
					data: {
						id: 1234,
						flw_ref: "FLW-REF-1",
						tx_ref: "ref-local",
						status: "successful",
						amount: 25.5,
						currency: "NGN",
					},
				},
			})

			const gateway = createFlutterwaveGateway(SECRET, HASH)
			const result = await gateway.verifyPayment("ref-local")

			expect(result).toMatchObject({
				status: "success",
				amount: 2550, // 25.5 * 100, rounded
				currency: "NGN",
				providerReference: "FLW-REF-1",
			})
			const call = mockRequest.mock.calls[0]?.[0] as AxiosRequestConfig
			expect(call?.url).toBe(
				"/transactions/verify_by_reference?tx_ref=ref-local"
			)
		})

		it("falls back to id when flw_ref is missing", async () => {
			mockRequest.mockResolvedValue({
				status: 200,
				data: {
					status: "success",
					message: "ok",
					data: {
						id: 42,
						tx_ref: "ref-local",
						status: "successful",
						amount: 10,
						currency: "USD",
					},
				},
			})

			const gateway = createFlutterwaveGateway(SECRET, HASH)
			const result = await gateway.verifyPayment("ref-local")
			expect(result.providerReference).toBe("42")
		})

		it.each([
			["successful", "success"],
			["success", "success"],
			["failed", "failed"],
			["abandoned", "abandoned"],
			["pending", "pending"],
			["other", "pending"],
		])("maps %s to %s", async (upstream, normalized) => {
			mockRequest.mockResolvedValue({
				status: 200,
				data: {
					status: "success",
					message: "ok",
					data: {
						id: 1,
						flw_ref: "f",
						tx_ref: "r",
						status: upstream,
						amount: 1,
						currency: "USD",
					},
				},
			})

			const gateway = createFlutterwaveGateway(SECRET, HASH)
			const result = await gateway.verifyPayment("r")
			expect(result.status).toBe(normalized)
		})
	})

	describe("parseWebhook", () => {
		const buildPayload = (overrides: Record<string, unknown> = {}) =>
			Buffer.from(
				JSON.stringify({
					event: "charge.completed",
					data: {
						id: 99,
						tx_ref: "ref-local",
						flw_ref: "FLW-99",
						status: "successful",
						amount: 25,
						currency: "NGN",
						...overrides,
					},
				})
			)

		it("rejects when verif-hash is missing", () => {
			const gateway = createFlutterwaveGateway(SECRET, HASH)
			expect(() => gateway.parseWebhook(buildPayload(), {})).toThrow(
				/Missing Flutterwave verif-hash/
			)
		})

		it("rejects when hash length differs", () => {
			const gateway = createFlutterwaveGateway(SECRET, HASH)
			expect(() =>
				gateway.parseWebhook(buildPayload(), { "verif-hash": "short" })
			).toThrow(/Invalid Flutterwave verif-hash/)
		})

		it("rejects when hash is same length but different", () => {
			const forged = "x".repeat(HASH.length)
			const gateway = createFlutterwaveGateway(SECRET, HASH)
			expect(() =>
				gateway.parseWebhook(buildPayload(), { "verif-hash": forged })
			).toThrow(/Invalid Flutterwave verif-hash/)
		})

		it("normalizes a valid event and converts the amount to minor units", () => {
			const gateway = createFlutterwaveGateway(SECRET, HASH)
			const event = gateway.parseWebhook(buildPayload(), {
				"verif-hash": HASH,
			})

			expect(event).toMatchObject({
				eventId: "99",
				reference: "ref-local",
				status: "success",
				amount: 2500,
				currency: "NGN",
				providerReference: "FLW-99",
			})
		})
	})
})
