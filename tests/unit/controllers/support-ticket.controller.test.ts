import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	createControllerTestResponse,
	invokeController,
	type ControllerTestRequest,
} from "../../helpers/controller-test.js"

const mockPrisma = {
	supportTicket: {
		findMany: vi.fn(),
		count: vi.fn(),
		findUnique: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
	},
	user: {
		findFirst: vi.fn(),
	},
	order: {
		findUnique: vi.fn(),
	},
	product: {
		findFirst: vi.fn(),
	},
	notification: {
		create: vi.fn(),
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

const { index, show, store, update, destroy } = await import(
	"../../../src/controllers/support-ticket.controller.js"
)

const USER_ID = "user-1"
const VENDOR_ID = "vendor-1"
const TICKET_ID = "11111111-2222-4333-8444-555555555555"
const VENDOR_UUID = "22222222-3333-4444-8555-666666666666"
const ORDER_ID = "33333333-4444-4555-8666-777777777777"
const PRODUCT_ID = "44444444-5555-4666-8777-888888888888"

const baseRequest = (
	overrides: Partial<ControllerTestRequest> = {}
): ControllerTestRequest => ({
	body: {},
	userId: USER_ID,
	sessionId: "sess-1",
	protocol: "http",
	get: vi.fn().mockReturnValue("example.com") as unknown as Request["get"],
	baseUrl: "",
	path: "/api/tickets",
	...overrides,
})

describe("Support Ticket Controller", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("index", () => {
		it("lists tickets where the user is requester or vendor by default", async () => {
			const tickets = [{ id: TICKET_ID, userId: USER_ID }]
			mockPrisma.supportTicket.findMany.mockResolvedValue(tickets)
			mockPrisma.supportTicket.count.mockResolvedValue(1)

			const response = createControllerTestResponse()
			await invokeController(index, baseRequest({ query: {} }), response)

			const where = mockPrisma.supportTicket.findMany.mock.calls[0]![0]!.where
			expect(where).toMatchObject({
				deletedAt: null,
				OR: [{ userId: USER_ID }, { vendorId: USER_ID }],
			})
			expect(response.status).toHaveBeenCalledWith(200)
		})

		it("filters by role=requester", async () => {
			mockPrisma.supportTicket.findMany.mockResolvedValue([])
			mockPrisma.supportTicket.count.mockResolvedValue(0)

			await invokeController(
				index,
				baseRequest({ query: { role: "requester" } }),
				createControllerTestResponse()
			)

			const where = mockPrisma.supportTicket.findMany.mock.calls[0]![0]!.where
			expect(where).toMatchObject({ userId: USER_ID })
			expect(where).not.toHaveProperty("OR")
		})

		it("filters by status and priority", async () => {
			mockPrisma.supportTicket.findMany.mockResolvedValue([])
			mockPrisma.supportTicket.count.mockResolvedValue(0)

			await invokeController(
				index,
				baseRequest({ query: { status: "OPEN", priority: "HIGH" } }),
				createControllerTestResponse()
			)

			const where = mockPrisma.supportTicket.findMany.mock.calls[0]![0]!.where
			expect(where).toMatchObject({ status: "OPEN", priority: "HIGH" })
		})
	})

	describe("show", () => {
		it("returns a ticket owned by the requester", async () => {
			const ticket = {
				id: TICKET_ID,
				userId: USER_ID,
				vendorId: null,
				deletedAt: null,
			}
			mockPrisma.supportTicket.findUnique.mockResolvedValue(ticket)

			const response = createControllerTestResponse()
			await invokeController(
				show,
				baseRequest({ params: { id: TICKET_ID } }),
				response
			)

			expect(response.status).toHaveBeenCalledWith(200)
			expect(response.json).toHaveBeenCalledWith({ data: ticket })
		})

		it("404s when the user is neither requester nor vendor", async () => {
			mockPrisma.supportTicket.findUnique.mockResolvedValue({
				id: TICKET_ID,
				userId: "someone-else",
				vendorId: "another",
				deletedAt: null,
			})

			await expect(
				invokeController(
					show,
					baseRequest({ params: { id: TICKET_ID } }),
					createControllerTestResponse()
				)
			).rejects.toMatchObject({ statusCode: 404 })
		})

		it("404s when the ticket is soft-deleted", async () => {
			mockPrisma.supportTicket.findUnique.mockResolvedValue({
				id: TICKET_ID,
				userId: USER_ID,
				vendorId: null,
				deletedAt: new Date(),
			})

			await expect(
				invokeController(
					show,
					baseRequest({ params: { id: TICKET_ID } }),
					createControllerTestResponse()
				)
			).rejects.toMatchObject({ statusCode: 404 })
		})
	})

	describe("store", () => {
		it("creates a platform ticket (no vendor) and does not notify", async () => {
			const created = {
				id: TICKET_ID,
				userId: USER_ID,
				vendorId: null,
				subject: "Help",
				body: "Issue",
			}
			mockPrisma.supportTicket.create.mockResolvedValue(created)

			const response = createControllerTestResponse()
			await invokeController(
				store,
				baseRequest({
					body: { subject: "Help", body: "Issue" },
				}),
				response
			)

			expect(mockPrisma.supportTicket.create).toHaveBeenCalled()
			expect(mockPrisma.notification.create).not.toHaveBeenCalled()
			expect(response.status).toHaveBeenCalledWith(201)
			expect(response.json).toHaveBeenCalledWith({ data: created })
		})

		it("creates a vendor ticket and notifies the vendor", async () => {
			mockPrisma.user.findFirst.mockResolvedValue({ id: VENDOR_UUID })
			const created = {
				id: TICKET_ID,
				userId: USER_ID,
				vendorId: VENDOR_UUID,
				subject: "Late delivery",
				body: "My order hasn't arrived",
			}
			mockPrisma.supportTicket.create.mockResolvedValue(created)

			await invokeController(
				store,
				baseRequest({
					body: {
						vendorId: VENDOR_UUID,
						subject: "Late delivery",
						body: "My order hasn't arrived",
					},
				}),
				createControllerTestResponse()
			)

			expect(mockPrisma.notification.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					userId: VENDOR_UUID,
					type: "TICKET_OPENED",
					data: { ticketId: TICKET_ID },
				}),
			})
		})

		it("422s when opening a ticket against yourself", async () => {
			await expect(
				invokeController(
					store,
					baseRequest({
						userId: VENDOR_UUID,
						body: {
							vendorId: VENDOR_UUID,
							subject: "Self ticket",
							body: "Hi",
						},
					}),
					createControllerTestResponse()
				)
			).rejects.toMatchObject({ statusCode: 422 })
		})

		it("404s when the vendor does not exist", async () => {
			mockPrisma.user.findFirst.mockResolvedValue(null)

			await expect(
				invokeController(
					store,
					baseRequest({
						body: {
							vendorId: VENDOR_UUID,
							subject: "Hello there",
							body: "Hello",
						},
					}),
					createControllerTestResponse()
				)
			).rejects.toMatchObject({ statusCode: 404 })
			expect(mockPrisma.supportTicket.create).not.toHaveBeenCalled()
		})

		it("404s when referencing an order not owned by the requester", async () => {
			mockPrisma.order.findUnique.mockResolvedValue({ userId: "someone-else" })

			await expect(
				invokeController(
					store,
					baseRequest({
						body: {
							orderId: ORDER_ID,
							subject: "Order issue",
							body: "Help",
						},
					}),
					createControllerTestResponse()
				)
			).rejects.toMatchObject({ statusCode: 404 })
		})

		it("404s when the referenced product does not exist", async () => {
			mockPrisma.product.findFirst.mockResolvedValue(null)

			await expect(
				invokeController(
					store,
					baseRequest({
						body: {
							productId: PRODUCT_ID,
							subject: "Broken",
							body: "Help",
						},
					}),
					createControllerTestResponse()
				)
			).rejects.toMatchObject({ statusCode: 404 })
		})

		it("422s when subject is too short", async () => {
			await expect(
				invokeController(
					store,
					baseRequest({ body: { subject: "hi", body: "Issue" } }),
					createControllerTestResponse()
				)
			).rejects.toBeDefined()
		})
	})

	describe("update", () => {
		const existing = {
			id: TICKET_ID,
			userId: USER_ID,
			vendorId: VENDOR_ID,
			status: "OPEN",
			priority: "NORMAL",
			closedAt: null,
			deletedAt: null,
			subject: "s",
		}

		it("422s when no updatable fields are provided", async () => {
			await expect(
				invokeController(
					update,
					baseRequest({ body: {}, params: { id: TICKET_ID } }),
					createControllerTestResponse()
				)
			).rejects.toMatchObject({ statusCode: 422 })
		})

		it("lets vendor change priority", async () => {
			mockPrisma.supportTicket.findUnique.mockResolvedValue(existing)
			mockPrisma.supportTicket.update.mockResolvedValue({
				...existing,
				priority: "URGENT",
			})

			await invokeController(
				update,
				baseRequest({
					body: { priority: "URGENT" },
					params: { id: TICKET_ID },
					userId: VENDOR_ID,
				}),
				createControllerTestResponse()
			)

			expect(mockPrisma.supportTicket.update).toHaveBeenCalledWith({
				where: { id: TICKET_ID },
				data: expect.objectContaining({ priority: "URGENT" }),
			})
		})

		it("forbids requester from changing priority", async () => {
			mockPrisma.supportTicket.findUnique.mockResolvedValue(existing)

			await expect(
				invokeController(
					update,
					baseRequest({
						body: { priority: "URGENT" },
						params: { id: TICKET_ID },
					}),
					createControllerTestResponse()
				)
			).rejects.toMatchObject({ statusCode: 403 })
		})

		it("forbids requester from marking resolved", async () => {
			mockPrisma.supportTicket.findUnique.mockResolvedValue(existing)

			await expect(
				invokeController(
					update,
					baseRequest({
						body: { status: "RESOLVED" },
						params: { id: TICKET_ID },
					}),
					createControllerTestResponse()
				)
			).rejects.toMatchObject({ statusCode: 403 })
		})

		it("lets requester close a ticket and sets closedAt", async () => {
			mockPrisma.supportTicket.findUnique.mockResolvedValue(existing)
			mockPrisma.supportTicket.update.mockResolvedValue({
				...existing,
				status: "CLOSED",
			})

			await invokeController(
				update,
				baseRequest({
					body: { status: "CLOSED" },
					params: { id: TICKET_ID },
				}),
				createControllerTestResponse()
			)

			const call = mockPrisma.supportTicket.update.mock.calls[0]![0]!
			expect(call.data.status).toBe("CLOSED")
			expect(call.data.closedAt).toBeInstanceOf(Date)
		})

		it("notifies the other party on status change", async () => {
			mockPrisma.supportTicket.findUnique.mockResolvedValue(existing)
			mockPrisma.supportTicket.update.mockResolvedValue({
				...existing,
				status: "RESOLVED",
			})

			await invokeController(
				update,
				baseRequest({
					body: { status: "RESOLVED" },
					params: { id: TICKET_ID },
					userId: VENDOR_ID,
				}),
				createControllerTestResponse()
			)

			expect(mockPrisma.notification.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					userId: USER_ID,
					type: "TICKET_STATUS_CHANGED",
				}),
			})
		})

		it("404s when the user is not a party", async () => {
			mockPrisma.supportTicket.findUnique.mockResolvedValue({
				...existing,
				userId: "someone-else",
				vendorId: "another",
			})

			await expect(
				invokeController(
					update,
					baseRequest({
						body: { status: "CLOSED" },
						params: { id: TICKET_ID },
					}),
					createControllerTestResponse()
				)
			).rejects.toMatchObject({ statusCode: 404 })
		})
	})

	describe("destroy", () => {
		it("soft-deletes a ticket owned by the requester", async () => {
			mockPrisma.supportTicket.findUnique.mockResolvedValue({
				id: TICKET_ID,
				userId: USER_ID,
				vendorId: null,
				deletedAt: null,
			})
			mockPrisma.supportTicket.update.mockResolvedValue({ id: TICKET_ID })

			const response = createControllerTestResponse()
			await invokeController(
				destroy,
				baseRequest({ params: { id: TICKET_ID } }),
				response
			)

			expect(mockPrisma.supportTicket.update).toHaveBeenCalledWith({
				where: { id: TICKET_ID },
				data: { deletedAt: expect.any(Date) },
			})
			expect(response.status).toHaveBeenCalledWith(204)
			expect(response.send).toHaveBeenCalled()
		})

		it("404s when the ticket belongs to another user", async () => {
			mockPrisma.supportTicket.findUnique.mockResolvedValue({
				id: TICKET_ID,
				userId: "someone-else",
				vendorId: null,
				deletedAt: null,
			})

			await expect(
				invokeController(
					destroy,
					baseRequest({ params: { id: TICKET_ID } }),
					createControllerTestResponse()
				)
			).rejects.toMatchObject({ statusCode: 404 })
			expect(mockPrisma.supportTicket.update).not.toHaveBeenCalled()
		})

		it("404s when the ticket is already soft-deleted", async () => {
			mockPrisma.supportTicket.findUnique.mockResolvedValue({
				id: TICKET_ID,
				userId: USER_ID,
				vendorId: null,
				deletedAt: new Date(),
			})

			await expect(
				invokeController(
					destroy,
					baseRequest({ params: { id: TICKET_ID } }),
					createControllerTestResponse()
				)
			).rejects.toMatchObject({ statusCode: 404 })
		})
	})
})
