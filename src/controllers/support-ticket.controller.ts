import type { Response } from "express"
import { NotificationType, TicketStatus } from "@prisma/client"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import { paginate } from "../lib/paginate.js"
import type {
	AuthenticatedHandler,
	AuthenticatedRequest,
} from "../middleware/protectedHandler.js"
import {
	createTicketSchema,
	indexTicketsSchema,
	ticketParamSchema,
	updateTicketSchema,
} from "../validations/support-ticket.schema.js"

const assertParty = (
	ticket: { userId: string; vendorId: string | null; deletedAt: Date | null },
	userId: string
): void => {
	if (ticket.deletedAt) throw new AppError(404, "Ticket not found")
	if (ticket.userId !== userId && ticket.vendorId !== userId) {
		throw new AppError(404, "Ticket not found")
	}
}

export const index: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { page, perPage, role, status, priority } = indexTicketsSchema.parse(
		request.query
	)

	const partyFilter =
		role === "requester"
			? { userId: request.userId }
			: role === "vendor"
				? { vendorId: request.userId }
				: {
						OR: [
							{ userId: request.userId },
							{ vendorId: request.userId },
						],
					}

	const where = {
		deletedAt: null,
		...(status ? { status } : {}),
		...(priority ? { priority } : {}),
		...partyFilter,
	}

	const [tickets, total] = await Promise.all([
		prisma.supportTicket.findMany({
			where,
			skip: (page - 1) * perPage,
			take: perPage,
			orderBy: { createdAt: "desc" },
			include: { _count: { select: { messages: true } } },
		}),
		prisma.supportTicket.count({ where }),
	])

	return response.status(200).json(
		paginate({
			request,
			data: tickets,
			total,
			page,
			perPage,
		})
	)
}

export const show: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { id } = ticketParamSchema.parse(request.params)

	const ticket = await prisma.supportTicket.findUnique({ where: { id } })
	if (!ticket) throw new AppError(404, "Ticket not found")
	assertParty(ticket, request.userId)

	return response.status(200).json({ data: ticket })
}

export const store: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const parsed = createTicketSchema.parse(request.body)

	if (parsed.vendorId && parsed.vendorId === request.userId) {
		throw new AppError(422, "Cannot open a ticket against yourself")
	}

	if (parsed.vendorId) {
		const vendor = await prisma.user.findFirst({
			where: { id: parsed.vendorId, deletedAt: null },
			select: { id: true },
		})
		if (!vendor) throw new AppError(404, "Vendor not found")
	}

	if (parsed.orderId) {
		const order = await prisma.order.findUnique({
			where: { id: parsed.orderId },
			select: { userId: true },
		})
		if (!order || order.userId !== request.userId) {
			throw new AppError(404, "Order not found")
		}
	}

	if (parsed.productId) {
		const product = await prisma.product.findFirst({
			where: { id: parsed.productId, deletedAt: null },
			select: { id: true },
		})
		if (!product) throw new AppError(404, "Product not found")
	}

	const ticket = await prisma.supportTicket.create({
		data: {
			userId: request.userId,
			vendorId: parsed.vendorId ?? null,
			orderId: parsed.orderId ?? null,
			productId: parsed.productId ?? null,
			subject: parsed.subject,
			body: parsed.body,
			...(parsed.priority ? { priority: parsed.priority } : {}),
		},
	})

	if (ticket.vendorId) {
		await prisma.notification.create({
			data: {
				userId: ticket.vendorId,
				type: NotificationType.TICKET_OPENED,
				title: `New support ticket: ${ticket.subject}`,
				body: ticket.body.slice(0, 280),
				data: { ticketId: ticket.id },
			},
		})
	}

	return response.status(201).json({ data: ticket })
}

export const update: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { id } = ticketParamSchema.parse(request.params)
	const { status, priority } = updateTicketSchema.parse(request.body)

	if (status === undefined && priority === undefined) {
		throw new AppError(422, "No updatable fields provided")
	}

	const existing = await prisma.supportTicket.findUnique({ where: { id } })
	if (!existing) throw new AppError(404, "Ticket not found")
	assertParty(existing, request.userId)

	const isVendor = existing.vendorId === request.userId
	const isRequester = existing.userId === request.userId

	if (priority !== undefined && !isVendor) {
		throw new AppError(403, "Only the vendor can change priority")
	}

	if (status !== undefined) {
		if (status === TicketStatus.RESOLVED && !isVendor) {
			throw new AppError(403, "Only the vendor can mark a ticket resolved")
		}
		if (status === TicketStatus.CLOSED && !isRequester && !isVendor) {
			throw new AppError(403, "Only a party can close the ticket")
		}
	}

	const nextClosedAt =
		status === TicketStatus.CLOSED
			? (existing.closedAt ?? new Date())
			: status
				? null
				: existing.closedAt

	const ticket = await prisma.supportTicket.update({
		where: { id },
		data: {
			...(status !== undefined && { status }),
			...(priority !== undefined && { priority }),
			closedAt: nextClosedAt,
		},
	})

	if (status !== undefined && status !== existing.status) {
		const otherUserId = isVendor ? ticket.userId : ticket.vendorId
		if (otherUserId) {
			await prisma.notification.create({
				data: {
					userId: otherUserId,
					type: NotificationType.TICKET_STATUS_CHANGED,
					title: `Ticket ${status.toLowerCase()}: ${ticket.subject}`,
					data: { ticketId: ticket.id, status },
				},
			})
		}
	}

	return response.status(200).json({ data: ticket })
}

export const destroy: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { id } = ticketParamSchema.parse(request.params)

	const existing = await prisma.supportTicket.findUnique({ where: { id } })
	if (!existing || existing.deletedAt) {
		throw new AppError(404, "Ticket not found")
	}
	if (existing.userId !== request.userId) {
		throw new AppError(404, "Ticket not found")
	}

	await prisma.supportTicket.update({
		where: { id },
		data: { deletedAt: new Date() },
	})

	return response.status(204).send()
}
