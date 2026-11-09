import { TicketPriority, TicketStatus } from "@prisma/client"
import { z } from "zod"
import { urlQuerySchema } from "./url-query.schema.js"

export const createTicketSchema = z.object({
	vendorId: z.uuid().nullable().optional(),
	orderId: z.uuid().nullable().optional(),
	productId: z.uuid().nullable().optional(),
	subject: z.string().trim().min(3).max(200),
	body: z.string().trim().min(1).max(5000),
	priority: z.enum(TicketPriority).optional(),
})

export const updateTicketSchema = z.object({
	status: z.enum(TicketStatus).optional(),
	priority: z.enum(TicketPriority).optional(),
})

export const indexTicketsSchema = urlQuerySchema.extend({
	role: z.enum(["requester", "vendor"]).optional(),
	status: z.enum(TicketStatus).optional(),
	priority: z.enum(TicketPriority).optional(),
})

export const ticketParamSchema = z.object({
	id: z.uuid(),
})

export const ticketIdParamSchema = z.object({
	ticketId: z.uuid(),
})

export const messageIdParamSchema = z.object({
	id: z.uuid(),
})

export const createTicketMessageSchema = z.object({
	body: z.string().trim().min(1).max(5000),
})

export const updateTicketMessageSchema = z.object({
	body: z.string().trim().min(1).max(5000),
})
