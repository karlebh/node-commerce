import type { ErrorRequestHandler } from "express"
import { ZodError } from "zod"
import { AppError } from "../errors/AppError.js"

export const errorHandler: ErrorRequestHandler = (
	error,
	request,
	response,
	_next
) => {
	if (error instanceof ZodError) {
		response.status(422).json({
			message: "Validation failed",
			errors: error.issues.map((issue) => ({
				field: issue.path.join("."),
				message: issue.message,
			})),
		})
		return
	}

	if (error instanceof AppError) {
		response.status(error.statusCode).json({
			message: error.message,
			...(error.details && { details: error.details }),
		})
		return
	}

	request.log.error({ err: error }, "Unhandled application error")

	response.status(500).json({
		message: "Internal server error",
	})
}
