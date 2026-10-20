import type { RequestHandler } from "express"
import { AppError } from "../errors/AppError.js"

export const notFound: RequestHandler = (request, _response, next): void =>
	next(new AppError(404, `Route ${request.method} ${request.path} not found`))
