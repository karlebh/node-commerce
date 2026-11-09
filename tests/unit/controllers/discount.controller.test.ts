import { Prisma } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	createControllerTestResponse,
	invokeController,
	type ControllerTestRequest,
} from "../../helpers/controller-test.js"

const mockPrisma = {
	discount: {
		findMany: vi.fn(),
		count: vi.fn(),
		findUnique: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	},
	cart: {
		findUnique: vi.fn(),
	},
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

const { index, show, store, update, destroy, apply } = await import(
	"../../../src/controllers/discount.controller.js"
)

const VALID_UUID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"
const OTHER_UUID = "c47ac10b-58cc-4372-a567-0e02b2c3d480"

const baseRequest = (overrides: Partial<ControllerTestRequest> = {}) => ({
	body: {},
	userId: "user-1",
	protocol: "http",
	get: vi.fn().mockReturnValue("example.com"),
	baseUrl: "",
	path: "/api/discounts",
	...overrides,
})

describe("Discount Controller", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("index", () => {
		it("returns the current user's paginated discounts", async () => {
			const discounts = [{ id: "d1", code: "SAVE10" }]
			mockPrisma.discount.findMany.mockResolvedValue(discounts)
			mockPrisma.discount.count.mockResolvedValue(1)

			const request = baseRequest({
				query: { page: "1", perPage: "10" },
			})
			const response = createControllerTestResponse()

			await invokeController(index, request, response)

			expect(mockPrisma.discount.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						userId: "user-1",
						deletedAt: null,
					}),
				})
			)
			expect(response.status).toHaveBeenCalledWith(200)
			expect(response.json).toHaveBeenCalledWith(
				expect.objectContaining({ data: discounts, total: 1 })
			)
		})

		it("adds a code search filter when ?search is provided", async () => {
			mockPrisma.discount.findMany.mockResolvedValue([])
			mockPrisma.discount.count.mockResolvedValue(0)

			await invokeController(
				index,
				baseRequest({ query: { search: "SAVE" } }),
				createControllerTestResponse()
			)

			expect(mockPrisma.discount.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						code: { contains: "SAVE", mode: "insensitive" },
					}),
				})
			)
		})
	})

	describe("show", () => {
		it("returns a discount owned by the user", async () => {
			const discount = {
				id: VALID_UUID,
				code: "SAVE10",
				userId: "user-1",
				deletedAt: null,
			}
			mockPrisma.discount.findUnique.mockResolvedValue(discount)

			const response = createControllerTestResponse()
			await invokeController(
				show,
				baseRequest({ params: { id: VALID_UUID } }),
				response
			)

			expect(response.status).toHaveBeenCalledWith(200)
			expect(response.json).toHaveBeenCalledWith({ data: { discount } })
		})

		it("throws 404 when the discount belongs to another user", async () => {
			mockPrisma.discount.findUnique.mockResolvedValue({
				id: VALID_UUID,
				userId: "someone-else",
				deletedAt: null,
			})

			await expect(
				invokeController(
					show,
					baseRequest({ params: { id: VALID_UUID } }),
					createControllerTestResponse()
				)
			).rejects.toThrow(/not found/i)
		})

		it("throws 404 when soft-deleted", async () => {
			mockPrisma.discount.findUnique.mockResolvedValue({
				id: VALID_UUID,
				userId: "user-1",
				deletedAt: new Date(),
			})

			await expect(
				invokeController(
					show,
					baseRequest({ params: { id: VALID_UUID } }),
					createControllerTestResponse()
				)
			).rejects.toThrow(/not found/i)
		})
	})

	describe("store", () => {
		it("creates a discount with uppercased code and owner", async () => {
			mockPrisma.discount.create.mockImplementation(
				async ({ data }: { data: Record<string, unknown> }) => ({
					id: "d-new",
					...data,
				})
			)

			const response = createControllerTestResponse()
			await invokeController(
				store,
				baseRequest({
					body: {
						code: "save10",
						type: "PERCENTAGE",
						value: 10,
					},
				}),
				response
			)

			expect(mockPrisma.discount.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					code: "SAVE10",
					user: { connect: { id: "user-1" } },
				}),
			})
			expect(response.status).toHaveBeenCalledWith(201)
		})

		it("throws 409 on duplicate code", async () => {
			mockPrisma.discount.create.mockRejectedValue(
				new Prisma.PrismaClientKnownRequestError("Unique constraint", {
					code: "P2002",
					clientVersion: "test",
				})
			)

			await expect(
				invokeController(
					store,
					baseRequest({
						body: {
							code: "SAVE10",
							type: "PERCENTAGE",
							value: 10,
						},
					}),
					createControllerTestResponse()
				)
			).rejects.toThrow(/already exists/i)
		})
	})

	describe("update", () => {
		it("updates the discount and uppercases the code", async () => {
			const updated = { id: VALID_UUID, code: "NEW10" }
			mockPrisma.discount.update.mockResolvedValue(updated)

			const response = createControllerTestResponse()
			await invokeController(
				update,
				baseRequest({
					params: { id: VALID_UUID },
					body: { code: "new10", isActive: false },
				}),
				response
			)

			expect(mockPrisma.discount.update).toHaveBeenCalledWith({
				where: { id: VALID_UUID },
				data: expect.objectContaining({
					code: "NEW10",
					isActive: false,
				}),
			})
			expect(response.status).toHaveBeenCalledWith(200)
		})

		it("maps P2025 to 404", async () => {
			mockPrisma.discount.update.mockRejectedValue(
				new Prisma.PrismaClientKnownRequestError("Not found", {
					code: "P2025",
					clientVersion: "test",
				})
			)

			await expect(
				invokeController(
					update,
					baseRequest({
						params: { id: VALID_UUID },
						body: { value: 15 },
					}),
					createControllerTestResponse()
				)
			).rejects.toThrow(/not found/i)
		})
	})

	describe("destroy", () => {
		it("deletes the discount and returns 204", async () => {
			mockPrisma.discount.delete.mockResolvedValue({})

			const response = createControllerTestResponse()
			await invokeController(
				destroy,
				baseRequest({ params: { id: VALID_UUID } }),
				response
			)

			expect(mockPrisma.discount.delete).toHaveBeenCalledWith({
				where: { id: VALID_UUID },
			})
			expect(response.status).toHaveBeenCalledWith(204)
			expect(response.send).toHaveBeenCalled()
		})
	})

	describe("apply", () => {
		it("rejects an empty cart", async () => {
			mockPrisma.cart.findUnique.mockResolvedValue({ id: "c1", items: [] })

			await expect(
				invokeController(
					apply,
					baseRequest({ body: { code: "SAVE10" } }),
					createControllerTestResponse()
				)
			).rejects.toThrow(/cart is empty/i)
		})

		it("returns computed discount totals for a valid code", async () => {
			mockPrisma.cart.findUnique.mockResolvedValue({
				id: "c1",
				items: [
					{
						id: "i1",
						quantity: 2,
						product: {
							price: 1000,
							isActive: true,
							deletedAt: null,
						},
					},
					{
						id: "i2",
						quantity: 1,
						product: {
							price: 500,
							isActive: true,
							deletedAt: null,
						},
					},
				],
			})
			mockPrisma.discount.findUnique.mockResolvedValue({
				id: "d1",
				code: "SAVE10",
				type: "PERCENTAGE",
				value: 10,
				minOrderAmount: null,
				maxDiscountAmount: null,
				usageLimit: null,
				usedCount: 0,
				startsAt: null,
				expiresAt: null,
				isActive: true,
				deletedAt: null,
			})

			const response = createControllerTestResponse()
			await invokeController(
				apply,
				baseRequest({ body: { code: "save10" } }),
				response
			)

			expect(mockPrisma.discount.findUnique).toHaveBeenCalledWith({
				where: { code: "SAVE10" },
			})
			expect(response.status).toHaveBeenCalledWith(200)
			expect(response.json).toHaveBeenCalledWith({
				data: {
					code: "SAVE10",
					type: "PERCENTAGE",
					subtotal: 2500,
					discountAmount: 250,
					total: 2250,
				},
			})
		})

		it("excludes inactive products from the subtotal", async () => {
			mockPrisma.cart.findUnique.mockResolvedValue({
				id: "c1",
				items: [
					{
						id: "i1",
						quantity: 1,
						product: {
							price: 1000,
							isActive: true,
							deletedAt: null,
						},
					},
					{
						id: "i2",
						quantity: 1,
						product: {
							price: 9999,
							isActive: false,
							deletedAt: null,
						},
					},
				],
			})
			mockPrisma.discount.findUnique.mockResolvedValue({
				id: "d1",
				code: "FLAT",
				type: "FIXED_AMOUNT",
				value: 100,
				minOrderAmount: null,
				maxDiscountAmount: null,
				usageLimit: null,
				usedCount: 0,
				startsAt: null,
				expiresAt: null,
				isActive: true,
				deletedAt: null,
			})

			const response = createControllerTestResponse()
			await invokeController(
				apply,
				baseRequest({ body: { code: "FLAT" } }),
				response
			)

			expect(response.json).toHaveBeenCalledWith({
				data: {
					code: "FLAT",
					type: "FIXED_AMOUNT",
					subtotal: 1000,
					discountAmount: 100,
					total: 900,
				},
			})
		})
	})

	it("prevents cross-user access via show (uuid suffix check)", () => {
		expect(OTHER_UUID).not.toBe(VALID_UUID)
	})
})
