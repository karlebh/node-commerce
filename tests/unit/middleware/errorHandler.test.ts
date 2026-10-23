import { describe, it, expect, vi } from "vitest"
import type { NextFunction, Request, Response } from "express"
import { z } from "zod"
import { errorHandler } from "../../../src/middleware/errorHandler.js"
import { AppError } from "../../../src/errors/AppError.js"

const buildRes = () => {
	const res = {
		status: vi.fn().mockReturnThis(),
		json: vi.fn().mockReturnThis(),
	} as unknown as Response
	return res
}

const buildReq = () =>
	({
		log: { error: vi.fn() },
	}) as unknown as Request

describe("errorHandler", () => {
	it("maps ZodError to 422 with field issues", () => {
		const schema = z.object({ name: z.string().min(5) })
		let caught: unknown
		try {
			schema.parse({ name: "a" })
		} catch (err) {
			caught = err
		}

		const res = buildRes()
		errorHandler(
			caught,
			buildReq(),
			res,
			(() => {}) as unknown as NextFunction
		)

		expect(res.status).toHaveBeenCalledWith(422)
		const body = (res.json as unknown as { mock: { calls: unknown[][] } })
			.mock.calls[0]?.[0] as {
			message: string
			errors: Array<{ field: string; message: string }>
		}
		expect(body.message).toBe("Validation failed")
		expect(body.errors.length).toBeGreaterThan(0)
		expect(body.errors[0]?.field).toBe("name")
	})

	it("maps AppError to its status code with message", () => {
		const err = new AppError(409, "Conflict!", { reason: "duplicate" })
		const res = buildRes()
		errorHandler(
			err,
			buildReq(),
			res,
			(() => {}) as unknown as NextFunction
		)
		expect(res.status).toHaveBeenCalledWith(409)
		expect(res.json).toHaveBeenCalledWith({
			message: "Conflict!",
			details: { reason: "duplicate" },
		})
	})

	it("maps AppError without details to a minimal body", () => {
		const err = new AppError(400, "Bad")
		const res = buildRes()
		errorHandler(
			err,
			buildReq(),
			res,
			(() => {}) as unknown as NextFunction
		)
		expect(res.status).toHaveBeenCalledWith(400)
		expect(res.json).toHaveBeenCalledWith({ message: "Bad" })
	})

	it("falls back to 500 for unknown errors and logs them", () => {
		const req = buildReq()
		const res = buildRes()
		errorHandler(
			new Error("oops"),
			req,
			res,
			(() => {}) as unknown as NextFunction
		)
		expect(res.status).toHaveBeenCalledWith(500)
		expect(res.json).toHaveBeenCalledWith({
			message: "Internal server error",
		})
		expect(req.log.error).toHaveBeenCalled()
	})
})
