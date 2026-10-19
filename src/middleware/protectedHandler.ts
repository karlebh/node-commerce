import type { NextFunction, Request, RequestHandler, Response } from "express"
import { AppError } from "../errors/AppError.js"
import {
	isAuthenticatedRequest,
	type AuthenticatedRequest,
} from "../types/authenticated-request.js"
import { requiresAuth } from "./requiresAuth.js"

export type { AuthenticatedRequest } from "../types/authenticated-request.js"

export type AuthenticatedHandler = (
	request: AuthenticatedRequest,
	response: Response,
	next: NextFunction
) => unknown

const runMiddlewareChain = (
	middlewares: RequestHandler[],
	request: Request,
	response: Response,
	next: NextFunction,
	handler: AuthenticatedHandler,
	index = 0
): void => {
	if (index === middlewares.length) {
		if (!isAuthenticatedRequest(request)) {
			next(new AppError(401, "Authentication required"))
			return
		}

		Promise.resolve(handler(request, response, next)).catch(next)
		return
	}

	const middleware = middlewares[index]
	if (!middleware) {
		next(new AppError(500, "Protected middleware chain is invalid"))
		return
	}

	middleware(request, response, (error?: unknown) => {
		if (error) {
			next(error)
			return
		}

		runMiddlewareChain(
			middlewares,
			request,
			response,
			next,
			handler,
			index + 1
		)
	})
}

export const protectedHandler =
	(handler: AuthenticatedHandler, ...middlewares: RequestHandler[]): RequestHandler =>
	(request: Request, response: Response, next: NextFunction) => {
		requiresAuth(request, response, (error?: unknown) => {
			if (error) {
				next(error)
				return
			}

			runMiddlewareChain(
				middlewares,
				request,
				response,
				next,
				handler
			)
		})
	}
