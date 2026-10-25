import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	createControllerTestResponse,
	invokeController,
	type ControllerTestRequest,
} from "../../helpers/controller-test.js"

const { mockPrisma, mockInitializePaymentIdempotently } = vi.hoisted(() => ({
	mockPrisma: { user: { findUnique: vi.fn() } },
	mockInitializePaymentIdempotently: vi.fn(),
}))

vi.mock("../../../src/database/prisma.js", () => ({ prisma: mockPrisma }))
vi.mock("../../../src/services/payment.service.js", () => ({
	initializePaymentIdempotently: mockInitializePaymentIdempotently,
	processWebhook: vi.fn(),
	verifyPayment: vi.fn(),
}))

const { initializePayment } = await import(
	"../../../src/controllers/payment.controller.js"
)

describe("Payment Controller", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockPrisma.user.findUnique.mockResolvedValue({
			email: "buyer@example.test",
		})
		mockInitializePaymentIdempotently.mockResolvedValue({
			authorizationUrl: "https://pay.example.test/authorize",
			reference: "payment-ref",
			payment: { id: "payment-1" },
		})
	})

	it("requires an Idempotency-Key header", async () => {
		const request: ControllerTestRequest<{
			amount: number
			provider: "paystack"
		}> = {
			body: { amount: 2500, provider: "paystack" },
			userId: "user-1",
			get: vi.fn().mockReturnValue(undefined),
		}

		await expect(
			invokeController(
				initializePayment,
				request,
				createControllerTestResponse()
			)
		).rejects.toMatchObject({ statusCode: 400 })

		expect(mockInitializePaymentIdempotently).not.toHaveBeenCalled()
	})

	it("passes the key and normalized payment input to the service", async () => {
		const request: ControllerTestRequest<{
			amount: number
			provider: "paystack"
			currency: string
		}> = {
			body: { amount: 2500, provider: "paystack", currency: "NGN" },
			userId: "user-1",
			get: vi.fn().mockReturnValue("request-1"),
		}
		const response = createControllerTestResponse()

		await invokeController(initializePayment, request, response)

		expect(mockInitializePaymentIdempotently).toHaveBeenCalledWith(
			{
				userId: "user-1",
				email: "buyer@example.test",
				amount: 2500,
				provider: "paystack",
				currency: "NGN",
				orderId: undefined,
			},
			"request-1"
		)
		expect(response.status).toHaveBeenCalledWith(201)
		expect(response.json).toHaveBeenCalledWith(
			expect.objectContaining({ reference: "payment-ref" })
		)
	})
})
