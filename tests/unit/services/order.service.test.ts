import { Prisma } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockPrisma, mockTx } = vi.hoisted(() => {
	const tx = {
		idempotencyKey: { update: vi.fn() },
		cart: { findUnique: vi.fn() },
		product: { findMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
		order: { create: vi.fn() },
		cartItem: { deleteMany: vi.fn() },
	}

	return {
		mockTx: tx,
		mockPrisma: {
			idempotencyKey: {
				create: vi.fn(),
				findUnique: vi.fn(),
				update: vi.fn(),
				updateMany: vi.fn(),
			},
			$transaction: vi.fn(),
		},
	}
})

vi.mock("../../../src/database/prisma.js", () => ({ prisma: mockPrisma }))
vi.mock("../../../src/configs/env.js", () => ({
	env: { IDEMPOTENCY_TTL_MS: 86400000 },
}))

const { placeOrderIdempotently } = await import(
	"../../../src/services/order.service.js"
)

const duplicateKeyError = () =>
	new Prisma.PrismaClientKnownRequestError("Duplicate key", {
		code: "P2002",
		clientVersion: "test",
	})

describe("Idempotent order placement", () => {
	beforeEach(() => {
		vi.clearAllMocks()

		mockTx.cart.findUnique.mockResolvedValue({
			items: [
				{
					id: "cart-item-1",
					productId: "product-1",
					quantity: 2,
				},
			],
		})
		mockTx.product.findMany.mockResolvedValue([
			{
				id: "product-1",
				name: "Product",
				price: 100,
				stock: 5,
				isActive: true,
				deletedAt: null,
			},
		])
		mockTx.product.updateMany.mockResolvedValue({ count: 1 })
		mockTx.order.create.mockResolvedValue({
			id: "order-1",
			total: 200,
			items: [{ productName: "Product", quantity: 2 }],
		})
		mockTx.cartItem.deleteMany.mockResolvedValue({ count: 1 })
		mockTx.idempotencyKey.update.mockImplementation(
			async ({ data }: { data: Record<string, unknown> }) => data
		)
		mockPrisma.idempotencyKey.update.mockResolvedValue({})
		mockPrisma.$transaction.mockImplementation(
			(callback: (tx: typeof mockTx) => Promise<unknown>) =>
				callback(mockTx)
		)
	})

	it("replays the original order without reserving stock or creating another order", async () => {
		let savedRecord: Record<string, unknown> | undefined
		mockPrisma.idempotencyKey.create.mockImplementation(
			async ({
				data,
			}: {
				data: Record<string, unknown>
			}) => {
				if (savedRecord) throw duplicateKeyError()
				savedRecord = {
					id: "key-1",
					userId: "user-1",
					key: "request-1",
					...data,
				}
				return { id: "key-1" }
			}
		)
		mockTx.idempotencyKey.update.mockImplementation(
			async ({ data }: { data: Record<string, unknown> }) => {
				savedRecord = { ...savedRecord, ...data }
				return savedRecord
			}
		)
		mockPrisma.idempotencyKey.findUnique.mockImplementation(async () => ({
			...savedRecord,
		}))

		const firstOrder = await placeOrderIdempotently("user-1", "request-1")
		const replayedOrder = await placeOrderIdempotently(
			"user-1",
			"request-1"
		)

		expect(replayedOrder).toEqual(JSON.parse(JSON.stringify(firstOrder)))
		expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
		expect(mockTx.product.updateMany).toHaveBeenCalledTimes(1)
		expect(mockTx.order.create).toHaveBeenCalledTimes(1)
		expect(mockTx.cartItem.deleteMany).toHaveBeenCalledTimes(1)
	})
})
