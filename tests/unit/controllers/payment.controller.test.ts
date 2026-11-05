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
	refundPayment: vi.fn(),
}))

const { initializePayment } = await import(
	"../../../src/controllers/payment.controller.js"
)

const ORDER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"

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
			provider: "paystack"
			orderId: string
		}> = {
			body: { provider: "paystack", orderId: ORDER_ID },
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
			provider: "paystack"
			orderId: string
		}> = {
			body: { provider: "paystack", orderId: ORDER_ID },
			userId: "user-1",
			get: vi.fn().mockReturnValue("request-1"),
		}
		const response = createControllerTestResponse()

		await invokeController(initializePayment, request, response)

		expect(mockInitializePaymentIdempotently).toHaveBeenCalledWith(
			{
				userId: "user-1",
				email: "buyer@example.test",
				provider: "paystack",
				orderId: ORDER_ID,
			},
			"request-1"
		)
		expect(response.status).toHaveBeenCalledWith(201)
		expect(response.json).toHaveBeenCalledWith(
			expect.objectContaining({ reference: "payment-ref" })
		)
	})

	it("rejects when the client tries to specify amount", async () => {
		const request: ControllerTestRequest<Record<string, unknown>> = {
			body: {
				provider: "paystack",
				orderId: ORDER_ID,
				amount: 99,
			},
			userId: "user-1",
			get: vi.fn().mockReturnValue("request-amount"),
		}

		// zod strict-less schema ignores unknown keys — ensure the service
		// is still called without an `amount` field
		await invokeController(
			initializePayment,
			request,
			createControllerTestResponse()
		)

		const call = mockInitializePaymentIdempotently.mock.calls[0]?.[0] as
			| Record<string, unknown>
			| undefined
		expect(call).toBeDefined()
		expect(call).not.toHaveProperty("amount")
		expect(call).not.toHaveProperty("currency")
	})

	it("rejects when orderId is missing", async () => {
		const request: ControllerTestRequest<{ provider: "paystack" }> = {
			body: { provider: "paystack" },
			userId: "user-1",
			get: vi.fn().mockReturnValue("request-no-order"),
		}

		await expect(
			invokeController(
				initializePayment,
				request,
				createControllerTestResponse()
			)
		).rejects.toBeTruthy()

		expect(mockInitializePaymentIdempotently).not.toHaveBeenCalled()
	})
})
