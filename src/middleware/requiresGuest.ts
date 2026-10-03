import type { RequestHandler } from "express"
import jwt from "jsonwebtoken"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"

export const requiresGuest: RequestHandler = async (
	request,
	_response,
	next
) => {
	try {
		const token = request.headers.authorization?.startsWith("Bearer ")
			? request.headers.authorization.slice(7)
			: null

		if (token) {
			let payload: { sub?: string; jti?: string } | null = null

			try {
				payload = jwt.verify(token, process.env.JWT_SECRET!) as {
					sub?: string
					jti?: string
				}
			} catch {
				payload = null
			}

			if (payload?.jti && payload.sub) {
				const session = await prisma.session.findFirst({
					where: {
						id: payload.jti,
						userId: payload.sub,
						expiresAt: { gt: new Date() },
						revokedAt: null,
					},
				})

				if (session) throw new AppError(409, "Already logged in")
			}
		}

		next()
	} catch (err) {
		next(err)
	}
}
