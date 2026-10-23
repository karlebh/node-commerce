import { describe, it, expect, vi } from "vitest"
import type { NextFunction, Request, Response } from "express"
import { requiresOwnership } from "../../../src/middleware/requiresOwnership.js"
import { AppError } from "../../../src/errors/AppError.js"

const buildRes = (): {
	status: ReturnType<typeof vi.fn>
	json: ReturnType<typeof vi.fn>
} => {
	const res: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } = {
		status: vi.fn().mockReturnThis(),
		json: vi.fn(),
	}
	return res
}

describe("requiresOwnership", () => {
	it("short-circuits unauthenticated requests via next with 401", async () => {
		const model = { findUnique: vi.fn() }
		const next = vi.fn()
		const req = {
			headers: {},
			params: { id: "x" },
		} as unknown as Request
		await requiresOwnership(model)(
			req,
			buildRes() as unknown as Response,
			next as unknown as NextFunction
		)
		const err = next.mock.calls[0]?.[0] as AppError
		expect(err).toBeInstanceOf(AppError)
		expect(err.statusCode).toBe(401)
	})

	it("returns 404 when record not found", async () => {
		const model = { findUnique: vi.fn().mockResolvedValueOnce(null) }
		const next = vi.fn()
		const res = buildRes()
		const req = {
			userId: "u1",
			sessionId: "s1",
			params: { id: "x" },
		} as unknown as Request
		await requiresOwnership(model)(
			req,
			res as unknown as Response,
			next as unknown as NextFunction
		)
		expect(res.status).toHaveBeenCalledWith(404)
		expect(res.json).toHaveBeenCalledWith({ message: "Not found" })
		expect(next).not.toHaveBeenCalled()
	})

	it("returns 404 when owner does not match", async () => {
		const model = {
			findUnique: vi
				.fn()
				.mockResolvedValueOnce({ id: "x", userId: "someone-else" }),
		}
		const next = vi.fn()
		const res = buildRes()
		const req = {
			userId: "u1",
			sessionId: "s1",
			params: { id: "x" },
		} as unknown as Request
		await requiresOwnership(model)(
			req,
			res as unknown as Response,
			next as unknown as NextFunction
		)
		expect(res.status).toHaveBeenCalledWith(404)
	})

	it("attaches record and calls next on ownership match", async () => {
		const record = { id: "x", userId: "u1", name: "mine" }
		const model = { findUnique: vi.fn().mockResolvedValueOnce(record) }
		const next = vi.fn()
		const req = {
			userId: "u1",
			sessionId: "s1",
			params: { id: "x" },
		} as unknown as Request & { record?: unknown }
		await requiresOwnership(model)(
			req,
			buildRes() as unknown as Response,
			next as unknown as NextFunction
		)
		expect(next).toHaveBeenCalledWith()
		expect((req as { record?: unknown }).record).toEqual(record)
	})

	it("supports a custom owner field", async () => {
		const record = { id: "x", ownerUserId: "u1" }
		const model = { findUnique: vi.fn().mockResolvedValueOnce(record) }
		const next = vi.fn()
		const req = {
			userId: "u1",
			sessionId: "s1",
			params: { id: "x" },
		} as unknown as Request
		await requiresOwnership(model, "ownerUserId")(
			req,
			buildRes() as unknown as Response,
			next as unknown as NextFunction
		)
		expect(next).toHaveBeenCalledWith()
	})

	it("forwards unexpected errors through next", async () => {
		const boom = new Error("db down")
		const model = { findUnique: vi.fn().mockRejectedValueOnce(boom) }
		const next = vi.fn()
		const req = {
			userId: "u1",
			sessionId: "s1",
			params: { id: "x" },
		} as unknown as Request
		await requiresOwnership(model)(
			req,
			buildRes() as unknown as Response,
			next as unknown as NextFunction
		)
		expect(next).toHaveBeenCalledWith(boom)
	})
})
