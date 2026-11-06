import type { Request, RequestHandler, Response } from "express"
import { z } from "zod"
import { prisma } from "../database/prisma.js"
import { env } from "../configs/env.js"

const unsubscribeParamsSchema = z.object({
	token: z.string().min(1),
})

const redirectTarget = `${env.FRONTEND_URL}/unsubscribed`

export const unsubscribe: RequestHandler = async (
	request: Request,
	response: Response
): Promise<void> => {
	const { token } = unsubscribeParamsSchema.parse(request.params)

	await prisma.user.updateMany({
		where: { unsubscribeToken: token, unsubscribedAt: null },
		data: { unsubscribedAt: new Date() },
	})

	response.redirect(redirectTarget)
}

export const unsubscribeOneClick: RequestHandler = async (
	request: Request,
	response: Response
): Promise<void> => {
	const { token } = unsubscribeParamsSchema.parse(request.params)

	await prisma.user.updateMany({
		where: { unsubscribeToken: token, unsubscribedAt: null },
		data: { unsubscribedAt: new Date() },
	})

	response.status(200).send()
}
