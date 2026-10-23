import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextFunction, Request, Response } from "express"
import jwt from "jsonwebtoken"

vi.mock("../../../src/database/prisma.js", async () => {
	const { createPrismaMock } = await import("../../helpers/prisma-mock.js")
	return { prisma: createPrismaMock() }
})

import { prisma } from "../../../src/database/prisma.js"
import type { PrismaMock } from "../../helpers/prisma-mock.js"
import { protectedHandler } from "../../../src/middleware/protectedHandler.js"
import { env } from "../../../src/configs/env.js"
import { AppError } from "../../../src/errors/AppError.js"

const prismaMock = prisma as unknown as PrismaMock

const buildValidAuth = (): Record<string, string> => {
	const token = jwt.sign({}, env.JWT_SECRET, {
		subject: "u1",
		jwtid: "s1",
		expiresIn: env.JWT_EXPIRES_IN,
	})
	return { authorization: `Bearer ${token}` }
}

const mockActiveSession = (): void => {
	prismaMock.session.findUnique.mockResolvedValueOnce({
		id: "s1",
		userId: "u1",
		revokedAt: null,
		expiresAt: new Date(Date.now() + 60_000),
	})
}

describe("protectedHandler", () => {
	beforeEach(() => {
		prismaMock.session.findUnique.mockReset()
	})

	it("blocks unauthenticated callers with 401 via next", async () => {
		const handler = vi.fn()
		const next = vi.fn()
		await protectedHandler(handler)(
			{ headers: {} } as unknown as Request,
			{} as Response,
			next as unknown as NextFunction
		)
		expect(handler).not.toHaveBeenCalled()
		const err = next.mock.calls[0]?.[0] as AppError
		expect(err.statusCode).toBe(401)
	})

	it("runs the handler when auth succeeds", async () => {
		mockActiveSession()
		const handler = vi.fn(
			(_req: unknown, res: Response) =>
				void res.status(200).json({ ok: true })
		)
		const next = vi.fn()
		const res = {
			status: vi.fn().mockReturnThis(),
			json: vi.fn(),
		} as unknown as Response

		await protectedHandler(handler)(
			{ headers: buildValidAuth() } as unknown as Request,
			res,
			next as unknown as NextFunction
		)

		expect(handler).toHaveBeenCalledOnce()
		expect(next).not.toHaveBeenCalled()
	})

	it("runs extra middlewares in order before the handler", async () => {
		mockActiveSession()
		const order: string[] = []
		const mw1: Parameters<typeof protectedHandler>[1] = (_r, _s, n) => {
			order.push("mw1")
			n()
		}
		const mw2: Parameters<typeof protectedHandler>[1] = (_r, _s, n) => {
			order.push("mw2")
			n()
		}
		const handler = vi.fn(() => {
			order.push("handler")
		})
		const next = vi.fn()
		const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response

		await protectedHandler(handler, mw1, mw2)(
			{ headers: buildValidAuth() } as unknown as Request,
			res,
			next as unknown as NextFunction
		)
		expect(order).toEqual(["mw1", "mw2", "handler"])
	})

	it("stops the chain when a middleware errors", async () => {
		mockActiveSession()
		const boom = new Error("fail")
		const mw: Parameters<typeof protectedHandler>[1] = (_r, _s, n) =>
			n(boom)
		const handler = vi.fn()
		const next = vi.fn()
		await protectedHandler(handler, mw)(
			{ headers: buildValidAuth() } as unknown as Request,
			{} as Response,
			next as unknown as NextFunction
		)
		expect(handler).not.toHaveBeenCalled()
		expect(next).toHaveBeenCalledWith(boom)
	})
})
