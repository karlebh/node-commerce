import { describe, it, expect, vi } from "vitest"
import type { Request, Response } from "express"
import { notFound } from "../../../src/middleware/notFound.js"
import { AppError } from "../../../src/errors/AppError.js"

describe("notFound", () => {
	it("passes a 404 AppError with method and path to next", () => {
		const next = vi.fn()
		notFound(
			{ method: "GET", path: "/missing" } as Request,
			{} as Response,
			next
		)

		expect(next).toHaveBeenCalledOnce()
		const error = next.mock.calls[0]?.[0] as AppError
		expect(error).toBeInstanceOf(AppError)
		expect(error.statusCode).toBe(404)
		expect(error.message).toBe("Route GET /missing not found")
	})
})
