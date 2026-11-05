import rateLimit, { ipKeyGenerator } from "express-rate-limit"
import type { Request } from "express"
import { isAuthenticatedRequest } from "../types/authenticated-request.js"

export const apiRateLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 100,
	standardHeaders: "draft-8",
	legacyHeaders: false,
	message: { message: "Too many requests, please try again later" },
})

const perUserOrIp = (request: Request): string => {
	if (isAuthenticatedRequest(request)) return `user:${request.userId}`
	return ipKeyGenerator(request.ip ?? "unknown")
}

export const paymentWriteRateLimiter = rateLimit({
	windowMs: 60 * 1000,
	limit: 10,
	standardHeaders: "draft-8",
	legacyHeaders: false,
	keyGenerator: perUserOrIp,
	message: {
		message: "Too many payment requests, please try again shortly",
	},
})

export const paymentReadRateLimiter = rateLimit({
	windowMs: 60 * 1000,
	limit: 30,
	standardHeaders: "draft-8",
	legacyHeaders: false,
	keyGenerator: perUserOrIp,
	message: {
		message: "Too many payment requests, please try again shortly",
	},
})
