import type { Response } from "express"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import { paginate } from "../lib/paginate.js"
import type {
	AuthenticatedHandler,
	AuthenticatedRequest,
} from "../middleware/protectedHandler.js"
import {
	indexNotificationsSchema,
	notificationParamSchema,
} from "../validations/notification.schema.js"

export const index: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { page, perPage, unreadOnly, type } = indexNotificationsSchema.parse(
		request.query
	)

	const where = {
		userId: request.userId,
		...(unreadOnly ? { readAt: null } : {}),
		...(type ? { type } : {}),
	}

	const [notifications, total, unreadCount] = await Promise.all([
		prisma.notification.findMany({
			where,
			skip: (page - 1) * perPage,
			take: perPage,
			orderBy: { createdAt: "desc" },
		}),
		prisma.notification.count({ where }),
		prisma.notification.count({
			where: { userId: request.userId, readAt: null },
		}),
	])

	return response.status(200).json({
		...paginate({
			request,
			data: notifications,
			total,
			page,
			perPage,
		}),
		unread_count: unreadCount,
	})
}

export const markRead: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { id } = notificationParamSchema.parse(request.params)

	const existing = await prisma.notification.findUnique({ where: { id } })
	if (!existing || existing.userId !== request.userId) {
		throw new AppError(404, "Notification not found")
	}

	const updated = await prisma.notification.update({
		where: { id },
		data: { readAt: existing.readAt ?? new Date() },
	})

	return response.status(200).json({ data: updated })
}

export const markAllRead: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const result = await prisma.notification.updateMany({
		where: { userId: request.userId, readAt: null },
		data: { readAt: new Date() },
	})

	return response.status(200).json({ updated: result.count })
}

export const destroy: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { id } = notificationParamSchema.parse(request.params)

	const existing = await prisma.notification.findUnique({ where: { id } })
	if (!existing || existing.userId !== request.userId) {
		throw new AppError(404, "Notification not found")
	}

	await prisma.notification.delete({ where: { id } })
	return response.status(204).send()
}
