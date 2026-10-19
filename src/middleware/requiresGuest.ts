import type { NextFunction, Request, RequestHandler, Response } from "express"
import jwt from "jsonwebtoken"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"

type Payload = { sub?: string; jti?: string }

const verifyToken = (token: string): Payload | null => {
	try {
		return jwt.verify(token, process.env.JWT_SECRET!) as Payload
	} catch {
		return null
	}
}

export const requiresGuest: RequestHandler = async (
	request: Request,
	_response: Response,
	next: NextFunction
) => {
	try {
		const header = request.headers.authorization
		const token = header?.startsWith("Bearer ") ? header.slice(7) : null
		const payload = token ? verifyToken(token) : null

		if (payload?.jti && payload.sub) {
			const session = await prisma.session.findFirst({
				where: {
					id: payload.jti,
					userId: payload.sub,
					expiresAt: { gt: new Date() },
					revokedAt: null,
				},
			})

			if (session) {
				throw new AppError(
					401,
					"Only guests can log in, remove the bearer token"
				)
			}
		}

		next()
	} catch (err) {
		next(err)
	}
}
