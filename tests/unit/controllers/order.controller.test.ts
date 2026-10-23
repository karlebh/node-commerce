import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	createControllerTestResponse,
	invokeController,
	type ControllerTestRequest,
} from "../../helpers/controller-test.js"

const mockPrisma = {
	order: {
		findMany: vi.fn(),
		count: vi.fn(),
		findUnique: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	},
}

const mockPlaceOrder = vi.fn()

vi.mock("../../../src/database/prisma.js", () => ({ prisma: mockPrisma }))

vi.mock("../../../src/services/order.service.js", () => ({
	placeOrder: mockPlaceOrder,
}))

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

const { index, show, store, update, destroy } = await import(
	"../../../src/controllers/order.controller.js"
)

const VALID_CUID2 = "clabcdefghij0123456789ab"

describe("Order Controller", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("index", () => {
		it("lists the user's orders with pagination", async () => {
			const orders = [{ id: VALID_CUID2, status: "PENDING", items: [] }]
			mockPrisma.order.findMany.mockResolvedValue(orders)
			mockPrisma.order.count.mockResolvedValue(1)

			const request: ControllerTestRequest<Record<string, never>> = {
				body: {},
				userId: "user-1",
				query: { page: "1", perPage: "10" },
				protocol: "http",
				get: vi.fn().mockReturnValue("example.com"),
				baseUrl: "",
				path: "/api/orders",
			}
			const response = createControllerTestResponse()

			await invokeController(index, request, response)

			expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { userId: "user-1" },
					skip: 0,
					take: 10,
					orderBy: { createdAt: "desc" },
				})
			)
			expect(response.status).toHaveBeenCalledWith(200)
		})

		it("filters by status when provided", async () => {
			mockPrisma.order.findMany.mockResolvedValue([])
			mockPrisma.order.count.mockResolvedValue(0)

			const request: ControllerTestRequest<Record<string, never>> = {
				body: {},
				userId: "user-1",
				query: { page: "1", perPage: "10", status: "PAID" },
				protocol: "http",
				get: vi.fn().mockReturnValue("example.com"),
				baseUrl: "",
				path: "/api/orders",
			}
			await invokeController(
				index,
				request,
				createControllerTestResponse()
			)

			expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { userId: "user-1", status: "PAID" },
				})
			)
		})
	})

	describe("show", () => {
		it("returns an order with items", async () => {
			const order = { id: VALID_CUID2, items: [] }
			mockPrisma.order.findUnique.mockResolvedValue(order)

			const response = createControllerTestResponse()
			await invokeController(
				show,
				{
					body: {},
					userId: "user-1",
					params: { id: VALID_CUID2 },
				},
				response
			)

			expect(mockPrisma.order.findUnique).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: VALID_CUID2, userId: "user-1" },
				})
			)
			expect(response.status).toHaveBeenCalledWith(200)
		})

		it("throws 404 when not found", async () => {
			mockPrisma.order.findUnique.mockResolvedValue(null)
			await expect(
				invokeController(
					show,
					{
						body: {},
						userId: "u1",
						params: { id: VALID_CUID2 },
					},
					createControllerTestResponse()
				)
			).rejects.toThrow("Order not found")
		})
	})

	describe("store", () => {
		it("places an order via the service", async () => {
			const order = { id: VALID_CUID2, items: [] }
			mockPlaceOrder.mockResolvedValue(order)

			const response = createControllerTestResponse()
			await invokeController(
				store,
				{ body: {}, userId: "user-1" },
				response
			)

			expect(mockPlaceOrder).toHaveBeenCalledWith("user-1")
			expect(response.status).toHaveBeenCalledWith(201)
			expect(response.json).toHaveBeenCalledWith({ data: order })
		})
	})

	describe("update", () => {
		it("updates the order status", async () => {
			const updated = { id: VALID_CUID2, status: "PAID" }
			mockPrisma.order.update.mockResolvedValue(updated)

			const response = createControllerTestResponse()
			await invokeController(
				update,
				{
					body: { status: "PAID" },
					userId: "user-1",
					params: { id: VALID_CUID2 },
				},
				response
			)

			expect(mockPrisma.order.update).toHaveBeenCalledWith({
				where: { id: VALID_CUID2, userId: "user-1" },
				data: { status: "PAID" },
			})
			expect(response.status).toHaveBeenCalledWith(200)
		})
	})

	describe("destroy", () => {
		it("deletes an order", async () => {
			mockPrisma.order.delete.mockResolvedValue({})

			const response = createControllerTestResponse()
			await invokeController(
				destroy,
				{
					body: {},
					userId: "user-1",
					params: { id: VALID_CUID2 },
				},
				response
			)

			expect(mockPrisma.order.delete).toHaveBeenCalledWith({
				where: { id: VALID_CUID2, userId: "user-1" },
			})
			expect(response.status).toHaveBeenCalledWith(200)
		})
	})
})
