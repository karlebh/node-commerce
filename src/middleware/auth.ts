import type { RequestHandler } from "express"
import jwt from "jsonwebtoken"
import { env } from "../configs/env.js"
import { AppError } from "../errors/AppError.js"

declare global {
	namespace Express {
		interface Request {
			userId?: string
		}
	}
}

export const requireAuth: RequestHandler = (request, _response, next) => {
	const token = request.headers.authorization?.replace("Bearer ", "")
	if (!token) return next(new AppError(401, "Authentication required"))

	try {
		const payload = jwt.verify(token, env.JWT_SECRET)
		if (typeof payload === "string" || !payload.sub)
			throw new Error("Invalid token")
		request.userId = payload.sub
		next()
	} catch {
		next(new AppError(401, "Invalid or expired token"))
	}
}
