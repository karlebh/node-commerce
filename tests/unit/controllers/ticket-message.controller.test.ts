import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	createControllerTestResponse,
	invokeController,
	type ControllerTestRequest,
} from "../../helpers/controller-test.js"

const mockPrisma = {
	supportTicket: {
		findUnique: vi.fn(),
	},
	ticketMessage: {
		findMany: vi.fn(),
		count: vi.fn(),
		findUnique: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
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

const { index, store, update, destroy } = await import(
	"../../../src/controllers/ticket-message.controller.js"
)

const USER_ID = "user-1"
const VENDOR_ID = "vendor-1"
const TICKET_ID = "11111111-2222-4333-8444-555555555555"
const MESSAGE_ID = "22222222-3333-4444-8555-666666666666"

const baseRequest = (
	overrides: Partial<ControllerTestRequest> = {}
): ControllerTestRequest => ({
	body: {},
	userId: USER_ID,
	sessionId: "sess-1",
	protocol: "http",
	get: vi.fn().mockReturnValue("example.com") as unknown as Request["get"],
	baseUrl: "",
	path: `/api/tickets/${TICKET_ID}/messages`,
	...overrides,
})

const activeTicket = {
	id: TICKET_ID,
	userId: USER_ID,
	vendorId: VENDOR_ID,
	deletedAt: null,
}

describe("Ticket Message Controller", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("index", () => {
		it("lists messages for a ticket the user is party to", async () => {
			mockPrisma.supportTicket.findUnique.mockResolvedValue(activeTicket)
			mockPrisma.ticketMessage.findMany.mockResolvedValue([
				{ id: MESSAGE_ID, ticketId: TICKET_ID },
			])
			mockPrisma.ticketMessage.count.mockResolvedValue(1)

			const response = createControllerTestResponse()
			await invokeController(
				index,
				baseRequest({ params: { ticketId: TICKET_ID }, query: {} }),
				response
			)

			expect(mockPrisma.ticketMessage.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { ticketId: TICKET_ID, deletedAt: null },
					orderBy: { createdAt: "asc" },
				})
			)
			expect(response.status).toHaveBeenCalledWith(200)
		})

		it("404s when the user is not a party on the ticket", async () => {
			mockPrisma.supportTicket.findUnique.mockResolvedValue({
				...activeTicket,
				userId: "someone-else",
				vendorId: "another",
			})

			await expect(
				invokeController(
					index,
					baseRequest({ params: { ticketId: TICKET_ID }, query: {} }),
					createControllerTestResponse()
				)
			).rejects.toMatchObject({ statusCode: 404 })
			expect(mockPrisma.ticketMessage.findMany).not.toHaveBeenCalled()
		})

		it("404s when the ticket is soft-deleted", async () => {
			mockPrisma.supportTicket.findUnique.mockResolvedValue({
				...activeTicket,
				deletedAt: new Date(),
			})

			await expect(
				invokeController(
					index,
					baseRequest({ params: { ticketId: TICKET_ID }, query: {} }),
					createControllerTestResponse()
				)
			).rejects.toMatchObject({ statusCode: 404 })
		})
	})

	describe("store", () => {
		it("creates a message and notifies the vendor when the requester replies", async () => {
			mockPrisma.supportTicket.findUnique.mockResolvedValue(activeTicket)
			mockPrisma.ticketMessage.create.mockResolvedValue({
				id: MESSAGE_ID,
				ticketId: TICKET_ID,
				userId: USER_ID,
				body: "Any update?",
			})

			const response = createControllerTestResponse()
			await invokeController(
				store,
				baseRequest({
					body: { body: "Any update?" },
					params: { ticketId: TICKET_ID },
				}),
				response
			)

			expect(mockPrisma.ticketMessage.create).toHaveBeenCalledWith({
				data: {
					ticketId: TICKET_ID,
					userId: USER_ID,
					body: "Any update?",
				},
			})
			expect(mockPrisma.notification.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					userId: VENDOR_ID,
					type: "TICKET_REPLIED",
					data: { ticketId: TICKET_ID, messageId: MESSAGE_ID },
				}),
			})
			expect(response.status).toHaveBeenCalledWith(201)
		})

		it("notifies the requester when the vendor replies", async () => {
			mockPrisma.supportTicket.findUnique.mockResolvedValue(activeTicket)
			mockPrisma.ticketMessage.create.mockResolvedValue({
				id: MESSAGE_ID,
				ticketId: TICKET_ID,
				userId: VENDOR_ID,
				body: "On it",
			})

			await invokeController(
				store,
				baseRequest({
					body: { body: "On it" },
					params: { ticketId: TICKET_ID },
					userId: VENDOR_ID,
				}),
				createControllerTestResponse()
			)

			expect(mockPrisma.notification.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					userId: USER_ID,
					type: "TICKET_REPLIED",
				}),
			})
		})

		it("does not notify when there is no vendor party (platform ticket)", async () => {
			mockPrisma.supportTicket.findUnique.mockResolvedValue({
				...activeTicket,
				vendorId: null,
			})
			mockPrisma.ticketMessage.create.mockResolvedValue({
				id: MESSAGE_ID,
				ticketId: TICKET_ID,
				userId: USER_ID,
				body: "Help",
			})

			await invokeController(
				store,
				baseRequest({
					body: { body: "Help" },
					params: { ticketId: TICKET_ID },
				}),
				createControllerTestResponse()
			)

			expect(mockPrisma.notification.create).not.toHaveBeenCalled()
		})

		it("422s when the body is empty", async () => {
			mockPrisma.supportTicket.findUnique.mockResolvedValue(activeTicket)

			await expect(
				invokeController(
					store,
					baseRequest({
						body: { body: "" },
						params: { ticketId: TICKET_ID },
					}),
					createControllerTestResponse()
				)
			).rejects.toBeDefined()
		})

		it("404s when the user is not a party", async () => {
			mockPrisma.supportTicket.findUnique.mockResolvedValue({
				...activeTicket,
				userId: "someone-else",
				vendorId: "another",
			})

			await expect(
				invokeController(
					store,
					baseRequest({
						body: { body: "Hello" },
						params: { ticketId: TICKET_ID },
					}),
					createControllerTestResponse()
				)
			).rejects.toMatchObject({ statusCode: 404 })
		})
	})

	describe("update", () => {
		it("updates an owned message", async () => {
			mockPrisma.ticketMessage.findUnique.mockResolvedValue({
				id: MESSAGE_ID,
				userId: USER_ID,
				deletedAt: null,
			})
			mockPrisma.ticketMessage.update.mockResolvedValue({
				id: MESSAGE_ID,
				body: "edited",
			})

			await invokeController(
				update,
				baseRequest({
					body: { body: "edited" },
					params: { id: MESSAGE_ID },
				}),
				createControllerTestResponse()
			)

			expect(mockPrisma.ticketMessage.update).toHaveBeenCalledWith({
				where: { id: MESSAGE_ID },
				data: { body: "edited" },
			})
		})

		it("404s when the message belongs to another user", async () => {
			mockPrisma.ticketMessage.findUnique.mockResolvedValue({
				id: MESSAGE_ID,
				userId: "someone-else",
				deletedAt: null,
			})

			await expect(
				invokeController(
					update,
					baseRequest({
						body: { body: "edited" },
						params: { id: MESSAGE_ID },
					}),
					createControllerTestResponse()
				)
			).rejects.toMatchObject({ statusCode: 404 })
		})
	})

	describe("destroy", () => {
		it("soft-deletes an owned message", async () => {
			mockPrisma.ticketMessage.findUnique.mockResolvedValue({
				id: MESSAGE_ID,
				userId: USER_ID,
				deletedAt: null,
			})
			mockPrisma.ticketMessage.update.mockResolvedValue({ id: MESSAGE_ID })

			const response = createControllerTestResponse()
			await invokeController(
				destroy,
				baseRequest({ params: { id: MESSAGE_ID } }),
				response
			)

			expect(mockPrisma.ticketMessage.update).toHaveBeenCalledWith({
				where: { id: MESSAGE_ID },
				data: { deletedAt: expect.any(Date) },
			})
			expect(response.status).toHaveBeenCalledWith(204)
			expect(response.send).toHaveBeenCalled()
		})

		it("404s when the message belongs to another user", async () => {
			mockPrisma.ticketMessage.findUnique.mockResolvedValue({
				id: MESSAGE_ID,
				userId: "someone-else",
				deletedAt: null,
			})

			await expect(
				invokeController(
					destroy,
					baseRequest({ params: { id: MESSAGE_ID } }),
					createControllerTestResponse()
				)
			).rejects.toMatchObject({ statusCode: 404 })
			expect(mockPrisma.ticketMessage.update).not.toHaveBeenCalled()
		})
	})
})
