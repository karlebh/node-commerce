import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	createControllerTestResponse,
	invokeController,
	type ControllerTestRequest,
} from "../../helpers/controller-test.js"

type TxShape = {
	product: { findUnique: ReturnType<typeof vi.fn> }
	cart: { upsert: ReturnType<typeof vi.fn> }
	cartItem: { upsert: ReturnType<typeof vi.fn> }
}

const mockPrisma = {
	cart: {
		findUnique: vi.fn(),
		upsert: vi.fn(),
	},
	cartItem: {
		delete: vi.fn(),
		deleteMany: vi.fn(),
		upsert: vi.fn(),
	},
	product: {
		findUnique: vi.fn(),
	},
	$transaction: vi.fn(),
}

vi.mock("../../../src/database/prisma.js", () => ({ prisma: mockPrisma }))

vi.mock("../../../src/lib/paginate.js", () => ({
	paginate: ({
		data,
		total,
		page,
		perPage,
	}: {
		data: unknown[]
		total: number
		page: number
		perPage: number
	}) => ({ data, total, current_page: page, per_page: perPage }),
}))

const { index, addItem, removeIteam, clearCart } = await import(
	"../../../src/controllers/cart.controller.js"
)

const VALID_CUID2 = "clabcdefghij0123456789ab"

describe("Cart Controller", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("index", () => {
		it("returns paginated cart items for the current user", async () => {
			mockPrisma.cart.findUnique.mockResolvedValue({
				id: "cart-1",
				_count: { items: 1 },
				items: [{ id: "ci-1", productId: "p1", quantity: 2 }],
			})

			const request: ControllerTestRequest<Record<string, never>> = {
				body: {},
				userId: "user-1",
				query: { page: "1", perPage: "10" },
				protocol: "http",
				get: vi.fn().mockReturnValue("example.com"),
				baseUrl: "",
				path: "/api/carts",
			}
			const response = createControllerTestResponse()

			await invokeController(index, request, response)

			expect(mockPrisma.cart.findUnique).toHaveBeenCalledWith(
				expect.objectContaining({ where: { userId: "user-1" } })
			)
			expect(response.status).toHaveBeenCalledWith(200)
			expect(response.json).toHaveBeenCalledWith(
				expect.objectContaining({ total: 1 })
			)
		})

		it("returns an empty payload when no cart exists", async () => {
			mockPrisma.cart.findUnique.mockResolvedValue(null)

			const request: ControllerTestRequest<Record<string, never>> = {
				body: {},
				userId: "user-1",
				query: { page: "1", perPage: "10" },
				protocol: "http",
				get: vi.fn().mockReturnValue("example.com"),
				baseUrl: "",
				path: "/api/carts",
			}
			const response = createControllerTestResponse()

			await invokeController(index, request, response)

			expect(response.json).toHaveBeenCalledWith(
				expect.objectContaining({ total: 0, data: [] })
			)
		})
	})

	describe("addItem", () => {
		const buildTx = (): TxShape => ({
			product: { findUnique: vi.fn() },
			cart: { upsert: vi.fn() },
			cartItem: { upsert: vi.fn() },
		})

		it("adds a new item under a transaction", async () => {
			const tx = buildTx()
			tx.product.findUnique.mockResolvedValue({
				id: VALID_CUID2,
				name: "P",
			})
			tx.cart.upsert.mockResolvedValue({ id: "cart-1" })
			tx.cartItem.upsert.mockResolvedValue({ id: "item-1" })
			mockPrisma.$transaction.mockImplementation(
				(cb: (t: TxShape) => Promise<unknown>) => cb(tx)
			)

			const request: ControllerTestRequest<{
				productId: string
				quantity: number
			}> = {
				body: { productId: VALID_CUID2, quantity: 3 },
				userId: "user-1",
			}
			const response = createControllerTestResponse()

			await invokeController(addItem, request, response)

			expect(tx.cart.upsert).toHaveBeenCalledWith({
				where: { userId: "user-1" },
				create: { userId: "user-1" },
				update: {},
			})
			expect(tx.cartItem.upsert).toHaveBeenCalledWith({
				where: {
					cartId_productId: {
						cartId: "cart-1",
						productId: VALID_CUID2,
					},
				},
				create: {
					productId: VALID_CUID2,
					quantity: 3,
					cartId: "cart-1",
				},
				update: { quantity: 3 },
			})
			expect(response.status).toHaveBeenCalledWith(201)
		})

		it("throws when the product does not exist", async () => {
			const tx = buildTx()
			tx.product.findUnique.mockResolvedValue(null)
			mockPrisma.$transaction.mockImplementation(
				(cb: (t: TxShape) => Promise<unknown>) => cb(tx)
			)

			await expect(
				invokeController(
					addItem,
					{
						body: { productId: VALID_CUID2, quantity: 1 },
						userId: "u1",
					},
					createControllerTestResponse()
				)
			).rejects.toThrow("Product does not exists")
		})
	})

	describe("removeIteam", () => {
		it("deletes a cart item by id", async () => {
			mockPrisma.cartItem.delete.mockResolvedValue({ id: VALID_CUID2 })

			const request: ControllerTestRequest<Record<string, never>> = {
				body: {},
				params: { id: VALID_CUID2 },
				userId: "user-1",
			}
			const response = createControllerTestResponse()

			await invokeController(removeIteam, request, response)

			expect(mockPrisma.cartItem.delete).toHaveBeenCalledWith({
				where: { id: VALID_CUID2 },
			})
			expect(response.status).toHaveBeenCalledWith(200)
		})
	})

	describe("clearCart", () => {
		it("deletes all cart items for the user", async () => {
			mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 3 })

			const response = createControllerTestResponse()
			await invokeController(
				clearCart,
				{ body: {}, userId: "user-1" },
				response
			)

			expect(mockPrisma.cartItem.deleteMany).toHaveBeenCalledWith({
				where: { cart: { userId: "user-1" } },
			})
			expect(response.status).toHaveBeenCalledWith(200)
		})
	})
})
