import { Prisma } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockPrisma, mockGateway } = vi.hoisted(() => ({
	mockPrisma: {
		idempotencyKey: {
			create: vi.fn(),
			findUnique: vi.fn(),
			update: vi.fn(),
			updateMany: vi.fn(),
		},
		payment: {
			create: vi.fn(),
			update: vi.fn(),
			findUnique: vi.fn(),
		},
		paymentWebhookEvent: { create: vi.fn() },
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
	},
}))

const { initializePaymentIdempotently } = await import(
	"../../../src/services/payment.service.js"
)

const duplicateKeyError = () =>
	new Prisma.PrismaClientKnownRequestError("Duplicate key", {
		code: "P2002",
		clientVersion: "test",
	})

describe("Idempotent payment initialization", () => {
	const args = {
		userId: "user-1",
		email: "buyer@example.test",
		amount: 2500,
		provider: "paystack" as const,
	}

	beforeEach(() => {
		vi.clearAllMocks()
		mockPrisma.idempotencyKey.create.mockResolvedValue({ id: "key-1" })
		mockPrisma.idempotencyKey.update.mockImplementation(
			async ({ data }: { data: Record<string, unknown> }) => data
		)
		mockPrisma.payment.create.mockResolvedValue({
			id: "payment-1",
			amount: args.amount,
			currency: "NGN",
		})
		mockPrisma.payment.update.mockImplementation(
			async ({ data }: { data: Record<string, unknown> }) => ({
				id: "payment-1",
				amount: args.amount,
				currency: "NGN",
				...data,
			})
		)
		mockGateway.initializePayment.mockResolvedValue({
			authorizationUrl: "https://pay.example.test/authorize",
			providerReference: "provider-ref-1",
			raw: { status: "success" },
		})
	})

	it("replays the original result without creating another payment", async () => {
		let savedRecord: Record<string, unknown> | undefined
		mockPrisma.idempotencyKey.update.mockImplementation(
			async ({
				data,
			}: {
				data: Record<string, unknown>
			}) => {
				savedRecord = { ...savedRecord, ...data }
				return savedRecord
			}
		)
		mockPrisma.idempotencyKey.create.mockImplementation(
			async ({
				data,
			}: {
				data: Record<string, unknown>
			}) => {
				if (savedRecord) throw duplicateKeyError()
				savedRecord = {
					id: "key-1",
					...data,
				}
				return { id: "key-1" }
			}
		)
		mockPrisma.idempotencyKey.findUnique.mockImplementation(async () => ({
			...savedRecord,
			userId: args.userId,
			key: "request-1",
		}))

		const firstResponse = await initializePaymentIdempotently(
			args,
			"request-1"
		)
		const replayedResponse = await initializePaymentIdempotently(
			args,
			"request-1"
		)

		expect(replayedResponse).toEqual(JSON.parse(JSON.stringify(firstResponse)))
		expect(mockGateway.initializePayment).toHaveBeenCalledTimes(1)
		expect(mockPrisma.payment.create).toHaveBeenCalledTimes(1)
		const createData = mockPrisma.idempotencyKey.create.mock.calls[0]?.[0]
			?.data as Record<string, unknown>
		const updateCalls = mockPrisma.idempotencyKey.update.mock.calls
		const completionData = updateCalls[updateCalls.length - 1]?.[0]
			?.data as Record<string, unknown>

		expect(createData).not.toHaveProperty("idempotentableId")
		expect(createData).not.toHaveProperty("idempotentableType")
		expect(completionData).not.toHaveProperty("idempotentableId")
		expect(completionData).not.toHaveProperty("idempotentableType")
	})

	it("rejects reuse of a key with different payment details", async () => {
		mockPrisma.idempotencyKey.create
			.mockResolvedValueOnce({ id: "key-1" })
			.mockRejectedValueOnce(duplicateKeyError())
		mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
			id: "key-1",
			userId: args.userId,
			key: "request-1",
			requestHash: "hash-of-original-request",
			status: "IN_PROGRESS",
			responseStatus: null,
			responseBody: null,
			expiresAt: new Date(Date.now() + 60_000),
		})

		await initializePaymentIdempotently(args, "request-1")

		await expect(
			initializePaymentIdempotently(
				{ ...args, amount: args.amount + 1 },
				"request-1"
			)
		).rejects.toMatchObject({ statusCode: 409 })

		expect(mockGateway.initializePayment).toHaveBeenCalledTimes(1)
	})
})
