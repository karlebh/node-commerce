import { Prisma } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockPrisma, mockGateway } = vi.hoisted(() => ({
	mockPrisma: {
		payment: {
			findUnique: vi.fn(),
			update: vi.fn(),
		},
		paymentWebhookEvent: {
			create: vi.fn(),
		},
		order: {
			update: vi.fn(),
			findUnique: vi.fn(),
		},
		ledgerEntry: {
			create: vi.fn(),
		},
		$transaction: vi.fn(),
	},
	mockGateway: {
		initializePayment: vi.fn(),
		verifyPayment: vi.fn(),
		parseWebhook: vi.fn(),
	},
}))

vi.mock("../../../src/database/prisma.js", () => ({ prisma: mockPrisma }))
vi.mock("../../../src/gateways/index.js", () => ({
	getGateway: () => mockGateway,
}))
vi.mock("../../../src/configs/env.js", () => ({
	env: {
		PAYMENT_CALLBACK_URL: "https://example.test/callback",
		IDEMPOTENCY_TTL_MS: 86400000,
		DEFAULT_CURRENCY: "NGN",
	},
}))

const { processWebhook } = await import(
	"../../../src/services/payment.service.js"
)

const duplicateKeyError = () =>
	new Prisma.PrismaClientKnownRequestError("Duplicate key", {
		code: "P2002",
		clientVersion: "test",
	})

const BASE_PAYMENT = {
	id: "payment-1",
	userId: "user-1",
	orderId: "order-1",
	reference: "pay_abc",
	provider: "PAYSTACK",
	status: "PENDING",
	amount: 2500,
	currency: "NGN",
}

describe("processWebhook", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockPrisma.$transaction.mockImplementation(
			async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					payment: {
						update: mockPrisma.payment.update,
					},
					order: {
						update: mockPrisma.order.update,
						findUnique: mockPrisma.order.findUnique,
					},
					ledgerEntry: {
						create: mockPrisma.ledgerEntry.create,
					},
				})
		)
		mockPrisma.order.findUnique.mockResolvedValue(null)
		mockPrisma.payment.update.mockImplementation(
			async ({ data }: { data: Record<string, unknown> }) => ({
				...BASE_PAYMENT,
				...data,
			})
		)
	})

	it("silently drops duplicate webhook events", async () => {
		mockGateway.parseWebhook.mockReturnValue({
			eventId: "evt-1",
			reference: BASE_PAYMENT.reference,
			status: "success",
			amount: BASE_PAYMENT.amount,
			currency: "NGN",
			providerReference: "prov-1",
			raw: { ok: true },
		})
		mockPrisma.paymentWebhookEvent.create.mockRejectedValueOnce(
			duplicateKeyError()
		)

		await processWebhook("paystack", Buffer.from("{}"), {})

		expect(mockPrisma.payment.findUnique).not.toHaveBeenCalled()
		expect(mockPrisma.payment.update).not.toHaveBeenCalled()
	})

	it("flips to FAILED when the webhook amount does not match the stored amount", async () => {
		mockGateway.parseWebhook.mockReturnValue({
			eventId: "evt-tamper",
			reference: BASE_PAYMENT.reference,
			status: "success",
			amount: BASE_PAYMENT.amount - 1, // tampered
			currency: "NGN",
			providerReference: "prov-2",
			raw: { tampered: true },
		})
		mockPrisma.paymentWebhookEvent.create.mockResolvedValue({})
		mockPrisma.payment.findUnique.mockResolvedValue(BASE_PAYMENT)

		await processWebhook("paystack", Buffer.from("{}"), {})

		const call = mockPrisma.payment.update.mock.calls[0]?.[0] as {
			data: { status: string }
		}
		expect(call.data.status).toBe("FAILED")
		expect(mockPrisma.order.update).not.toHaveBeenCalled()
		expect(mockPrisma.ledgerEntry.create).not.toHaveBeenCalled()
	})

	it("flips to FAILED when the webhook currency does not match", async () => {
		mockGateway.parseWebhook.mockReturnValue({
			eventId: "evt-currency",
			reference: BASE_PAYMENT.reference,
			status: "success",
			amount: BASE_PAYMENT.amount,
			currency: "USD",
			providerReference: "prov-3",
			raw: {},
		})
		mockPrisma.paymentWebhookEvent.create.mockResolvedValue({})
		mockPrisma.payment.findUnique.mockResolvedValue(BASE_PAYMENT)

		await processWebhook("paystack", Buffer.from("{}"), {})

		const call = mockPrisma.payment.update.mock.calls[0]?.[0] as {
			data: { status: string }
		}
		expect(call.data.status).toBe("FAILED")
		expect(mockPrisma.ledgerEntry.create).not.toHaveBeenCalled()
	})

	it("writes a ledger entry and marks the order PAID on first success", async () => {
		mockGateway.parseWebhook.mockReturnValue({
			eventId: "evt-ok",
			reference: BASE_PAYMENT.reference,
			status: "success",
			amount: BASE_PAYMENT.amount,
			currency: "NGN",
			providerReference: "prov-ok",
			raw: {},
		})
		mockPrisma.paymentWebhookEvent.create.mockResolvedValue({})
		mockPrisma.payment.findUnique.mockResolvedValue({
			...BASE_PAYMENT,
			status: "PENDING",
		})
		mockPrisma.ledgerEntry.create.mockResolvedValue({})

		await processWebhook("paystack", Buffer.from("{}"), {})

		expect(mockPrisma.order.update).toHaveBeenCalledWith({
			where: { id: BASE_PAYMENT.orderId },
			data: { status: "PAID" },
		})
		expect(mockPrisma.ledgerEntry.create).toHaveBeenCalledTimes(1)
		const ledger = mockPrisma.ledgerEntry.create.mock.calls[0]?.[0] as {
			data: {
				type: string
				direction: string
				amount: number
				reference: string
			}
		}
		expect(ledger.data).toMatchObject({
			type: "PAYMENT",
			direction: "CREDIT",
			amount: BASE_PAYMENT.amount,
			reference: BASE_PAYMENT.reference,
		})
	})

	it("does not re-credit when the payment was already SUCCESS", async () => {
		mockGateway.parseWebhook.mockReturnValue({
			eventId: "evt-again",
			reference: BASE_PAYMENT.reference,
			status: "success",
			amount: BASE_PAYMENT.amount,
			currency: "NGN",
			providerReference: "prov-again",
			raw: {},
		})
		mockPrisma.paymentWebhookEvent.create.mockResolvedValue({})
		mockPrisma.payment.findUnique.mockResolvedValue({
			...BASE_PAYMENT,
			status: "SUCCESS",
		})

		await processWebhook("paystack", Buffer.from("{}"), {})

		expect(mockPrisma.order.update).not.toHaveBeenCalled()
		expect(mockPrisma.ledgerEntry.create).not.toHaveBeenCalled()
	})

	it("ignores events for unknown references", async () => {
		mockGateway.parseWebhook.mockReturnValue({
			eventId: "evt-missing",
			reference: "pay_missing",
			status: "success",
			amount: 100,
			currency: "NGN",
			providerReference: "prov-x",
			raw: {},
		})
		mockPrisma.paymentWebhookEvent.create.mockResolvedValue({})
		mockPrisma.payment.findUnique.mockResolvedValue(null)

		await processWebhook("paystack", Buffer.from("{}"), {})

		expect(mockPrisma.payment.update).not.toHaveBeenCalled()
	})
})
