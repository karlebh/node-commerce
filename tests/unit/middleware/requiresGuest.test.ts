import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextFunction, Request, Response } from "express"
import jwt from "jsonwebtoken"

vi.mock("../../../src/database/prisma.js", async () => {
	const { createPrismaMock } = await import("../../helpers/prisma-mock.js")
	return { prisma: createPrismaMock() }
})

import { prisma } from "../../../src/database/prisma.js"
import type { PrismaMock } from "../../helpers/prisma-mock.js"
import { requiresGuest } from "../../../src/middleware/requiresGuest.js"
import { AppError } from "../../../src/errors/AppError.js"

const prismaMock = prisma as unknown as PrismaMock

const run = async (
	headers: Record<string, string | undefined>
): Promise<ReturnType<typeof vi.fn>> => {
	const req = { headers } as unknown as Request
	const next = vi.fn()
	await requiresGuest(req, {} as Response, next as unknown as NextFunction)
	return next
}

describe("requiresGuest", () => {
	beforeEach(() => {
		prismaMock.session.findFirst.mockReset()
	})

	it("allows requests without an Authorization header", async () => {
		const next = await run({})
		expect(next).toHaveBeenCalledWith()
	})

	it("allows requests whose token is invalid (ignores it)", async () => {
		const next = await run({ authorization: "Bearer garbage" })
		expect(next).toHaveBeenCalledWith()
	})

	it("rejects a request whose token has an active session", async () => {
		const token = jwt.sign(
			{},
			process.env.JWT_SECRET ??
				"development-only-secret-change-me-123456",
			{
				subject: "u1",
				jwtid: "sess-1",
				expiresIn: "1h",
			}
		)
		prismaMock.session.findFirst.mockResolvedValueOnce({
			id: "sess-1",
			userId: "u1",
		})
		const next = await run({ authorization: `Bearer ${token}` })
		const err = next.mock.calls[0]?.[0] as AppError
		expect(err).toBeInstanceOf(AppError)
		expect(err.statusCode).toBe(401)
	})

	it("allows a token whose session has expired or is revoked", async () => {
		const token = jwt.sign(
			{},
			process.env.JWT_SECRET ??
				"development-only-secret-change-me-123456",
			{
				subject: "u1",
				jwtid: "sess-1",
				expiresIn: "1h",
			}
		)
		prismaMock.session.findFirst.mockResolvedValueOnce(null)
		const next = await run({ authorization: `Bearer ${token}` })
		expect(next).toHaveBeenCalledWith()
	})
})
