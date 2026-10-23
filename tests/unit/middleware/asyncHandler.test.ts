import { describe, it, expect, vi } from "vitest"
import type { NextFunction, Request, Response } from "express"
import { asyncHandler } from "../../../src/middleware/asyncHandler.js"

describe("asyncHandler", () => {
	it("invokes the handler and forwards resolved values", async () => {
		const inner = vi.fn(async (_req, res) => {
			;(res as Response).status(200).json({ ok: true })
		})
		const next = vi.fn()
		const res = {
			status: vi.fn().mockReturnThis(),
			json: vi.fn(),
		} as unknown as Response

		await asyncHandler(inner)({} as Request, res, next)

		expect(inner).toHaveBeenCalledOnce()
		expect(next).not.toHaveBeenCalled()
	})

	it("forwards async rejections to next", async () => {
		const boom = new Error("boom")
		const inner = vi.fn(async () => {
			throw boom
		})
		const next = vi.fn() as unknown as NextFunction

		await asyncHandler(inner)({} as Request, {} as Response, next)

		expect(next).toHaveBeenCalledWith(boom)
	})

	it("lets a sync throw propagate (current implementation wraps with Promise.resolve, not try/catch)", () => {
		const boom = new Error("sync boom")
		const inner = (() => {
			throw boom
		}) as unknown as Parameters<typeof asyncHandler>[0]
		const next = vi.fn() as unknown as NextFunction

		expect(() =>
			asyncHandler(inner)({} as Request, {} as Response, next)
		).toThrow("sync boom")
	})
})
