import type { Response } from "express"
import { NotificationType } from "@prisma/client"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import { paginate } from "../lib/paginate.js"
import type {
	AuthenticatedHandler,
	AuthenticatedRequest,
} from "../middleware/protectedHandler.js"
import { urlQuerySchema } from "../validations/url-query.schema.js"
import {
	createTicketMessageSchema,
	messageIdParamSchema,
	ticketIdParamSchema,
	updateTicketMessageSchema,
} from "../validations/support-ticket.schema.js"

const loadTicketForParty = async (
	ticketId: string,
	userId: string
): Promise<{ id: string; userId: string; vendorId: string | null }> => {
	const ticket = await prisma.supportTicket.findUnique({
		where: { id: ticketId },
		select: { id: true, userId: true, vendorId: true, deletedAt: true },
	})
	if (!ticket || ticket.deletedAt) throw new AppError(404, "Ticket not found")
	if (ticket.userId !== userId && ticket.vendorId !== userId) {
		throw new AppError(404, "Ticket not found")
	}
	return { id: ticket.id, userId: ticket.userId, vendorId: ticket.vendorId }
}

export const index: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { ticketId } = ticketIdParamSchema.parse(request.params)
	const { page, perPage } = urlQuerySchema.parse(request.query)

	await loadTicketForParty(ticketId, request.userId)

	const where = { ticketId, deletedAt: null }

	const [messages, total] = await Promise.all([
		prisma.ticketMessage.findMany({
			where,
			skip: (page - 1) * perPage,
			take: perPage,
			orderBy: { createdAt: "asc" },
		}),
		prisma.ticketMessage.count({ where }),
	])

	return response.status(200).json(
		paginate({
			request,
			data: messages,
			total,
			page,
			perPage,
		})
	)
}

export const store: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { ticketId } = ticketIdParamSchema.parse(request.params)
	const { body } = createTicketMessageSchema.parse(request.body)

	const ticket = await loadTicketForParty(ticketId, request.userId)

	const message = await prisma.ticketMessage.create({
		data: { ticketId, userId: request.userId, body },
	})

	const otherUserId =
		ticket.userId === request.userId ? ticket.vendorId : ticket.userId
	if (otherUserId) {
		await prisma.notification.create({
			data: {
				userId: otherUserId,
				type: NotificationType.TICKET_REPLIED,
				title: "New reply on your support ticket",
				body: body.slice(0, 280),
				data: { ticketId, messageId: message.id },
			},
		})
	}

	return response.status(201).json({ data: message })
}

export const update: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { id } = messageIdParamSchema.parse(request.params)
	const { body } = updateTicketMessageSchema.parse(request.body)

	const existing = await prisma.ticketMessage.findUnique({ where: { id } })
	if (!existing || existing.deletedAt) {
		throw new AppError(404, "Message not found")
	}
	if (existing.userId !== request.userId) {
		throw new AppError(404, "Message not found")
	}

	const message = await prisma.ticketMessage.update({
		where: { id },
		data: { body },
	})

	return response.status(200).json({ data: message })
}

export const destroy: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { id } = messageIdParamSchema.parse(request.params)

	const existing = await prisma.ticketMessage.findUnique({ where: { id } })
	if (!existing || existing.deletedAt) {
		throw new AppError(404, "Message not found")
	}
	if (existing.userId !== request.userId) {
		throw new AppError(404, "Message not found")
	}

	await prisma.ticketMessage.update({
		where: { id },
		data: { deletedAt: new Date() },
	})

	return response.status(204).send()
}
