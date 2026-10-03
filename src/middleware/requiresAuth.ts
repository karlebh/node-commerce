import { type RequestHandler } from "express"
import jwt from "jsonwebtoken"
import { env } from "../configs/env.js"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import type { AccessTokenPayload } from "../types/index.js"

export const requiresAuth: RequestHandler = async (
	request,
	_response,
	next
) => {
	try {
		const header = request.headers.authorization
		if (!header?.startsWith("Bearer ")) {
			throw new AppError(401, "Authentication required")
		}

		const token = header.slice("Bearer ".length)

		let payload: AccessTokenPayload
		try {
			payload = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload
		} catch {
			throw new AppError(401, "Invalid or expired token")
		}

		if (!payload.jti || !payload.sub) {
			throw new AppError(401, "Malformed token")
		}

		const session = await prisma.session.findUnique({
			where: { id: payload.jti },
		})

		if (!session) throw new AppError(401, "Session not found")
		if (session.revokedAt) throw new AppError(401, "Session revoked")
		if (session.expiresAt < new Date())
			throw new AppError(401, "Session expired")
		if (session.userId !== payload.sub)
			throw new AppError(401, "Invalid session")

		request.userId = session.userId
		request.sessionId = session.id
		next()
	} catch (err) {
		next(err)
	}
}
