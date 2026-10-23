import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextFunction, Request, Response } from "express"
import jwt from "jsonwebtoken"

vi.mock("../../../src/database/prisma.js", async () => {
	const { createPrismaMock } = await import("../../helpers/prisma-mock.js")
	return { prisma: createPrismaMock() }
})

import { prisma } from "../../../src/database/prisma.js"
import type { PrismaMock } from "../../helpers/prisma-mock.js"
import { requiresAuth } from "../../../src/middleware/requiresAuth.js"
import { env } from "../../../src/configs/env.js"
import { AppError } from "../../../src/errors/AppError.js"

const prismaMock = prisma as unknown as PrismaMock

const run = async (
	headers: Record<string, string | undefined>
): Promise<{ next: ReturnType<typeof vi.fn>; req: Request }> => {
	const req = { headers } as unknown as Request & {
		userId?: string
		sessionId?: string
	}
	const next = vi.fn()
	await requiresAuth(req, {} as Response, next as unknown as NextFunction)
	return { next, req }
}

describe("requiresAuth", () => {
	beforeEach(() => {
		prismaMock.session.findUnique.mockReset()
	})

	it("rejects when the Authorization header is missing", async () => {
		const { next } = await run({})
		const error = next.mock.calls[0]?.[0] as AppError
		expect(error).toBeInstanceOf(AppError)
		expect(error.statusCode).toBe(401)
		expect(error.message).toBe("Authentication required")
	})

	it("rejects a malformed Authorization header", async () => {
		const { next } = await run({ authorization: "Basic abc" })
		const error = next.mock.calls[0]?.[0] as AppError
		expect(error.statusCode).toBe(401)
	})

	it("rejects an invalid token", async () => {
		const { next } = await run({
			authorization: "Bearer not-a-real-jwt",
		})
		const error = next.mock.calls[0]?.[0] as AppError
		expect(error.statusCode).toBe(401)
		expect(error.message).toBe("Invalid or expired token")
	})

	it("rejects when no session exists for the jti", async () => {
		const token = jwt.sign({}, env.JWT_SECRET, {
			subject: "user-1",
			jwtid: "sess-x",
			expiresIn: env.JWT_EXPIRES_IN,
		})
		prismaMock.session.findUnique.mockResolvedValueOnce(null)
		const { next } = await run({ authorization: `Bearer ${token}` })
		const error = next.mock.calls[0]?.[0] as AppError
		expect(error.statusCode).toBe(401)
		expect(error.message).toBe("Session not found")
	})

	it("rejects a revoked session", async () => {
		const token = jwt.sign({}, env.JWT_SECRET, {
			subject: "user-1",
			jwtid: "sess-x",
			expiresIn: env.JWT_EXPIRES_IN,
		})
		prismaMock.session.findUnique.mockResolvedValueOnce({
			id: "sess-x",
			userId: "user-1",
			revokedAt: new Date(),
			expiresAt: new Date(Date.now() + 60_000),
		})
		const { next } = await run({ authorization: `Bearer ${token}` })
		expect((next.mock.calls[0]?.[0] as AppError).message).toBe(
			"Session revoked"
		)
	})

	it("rejects an expired session", async () => {
		const token = jwt.sign({}, env.JWT_SECRET, {
			subject: "user-1",
			jwtid: "sess-x",
			expiresIn: env.JWT_EXPIRES_IN,
		})
		prismaMock.session.findUnique.mockResolvedValueOnce({
			id: "sess-x",
			userId: "user-1",
			revokedAt: null,
			expiresAt: new Date(Date.now() - 10_000),
		})
		const { next } = await run({ authorization: `Bearer ${token}` })
		expect((next.mock.calls[0]?.[0] as AppError).message).toBe(
			"Session expired"
		)
	})

	it("rejects when userId does not match sub", async () => {
		const token = jwt.sign({}, env.JWT_SECRET, {
			subject: "user-1",
			jwtid: "sess-x",
			expiresIn: env.JWT_EXPIRES_IN,
		})
		prismaMock.session.findUnique.mockResolvedValueOnce({
			id: "sess-x",
			userId: "someone-else",
			revokedAt: null,
			expiresAt: new Date(Date.now() + 60_000),
		})
		const { next } = await run({ authorization: `Bearer ${token}` })
		expect((next.mock.calls[0]?.[0] as AppError).message).toBe(
			"Invalid session"
		)
	})

	it("sets userId and sessionId and calls next on success", async () => {
		const token = jwt.sign({}, env.JWT_SECRET, {
			subject: "user-1",
			jwtid: "sess-x",
			expiresIn: env.JWT_EXPIRES_IN,
		})
		prismaMock.session.findUnique.mockResolvedValueOnce({
			id: "sess-x",
			userId: "user-1",
			revokedAt: null,
			expiresAt: new Date(Date.now() + 60_000),
		})
		const { next, req } = await run({
			authorization: `Bearer ${token}`,
		})
		expect(next).toHaveBeenCalledWith()
		expect(
			(req as unknown as { userId: string; sessionId: string }).userId
		).toBe("user-1")
		expect(
			(req as unknown as { userId: string; sessionId: string })
				.sessionId
		).toBe("sess-x")
	})
})
