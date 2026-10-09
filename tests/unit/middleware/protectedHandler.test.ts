import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Request, Response } from "express"
import { AppError } from "../../../src/errors/AppError.js"

const { requiresAuthMock } = vi.hoisted(() => ({
	requiresAuthMock: vi.fn(),
}))

vi.mock("../../../src/middleware/requiresAuth.js", () => ({
	requiresAuth: requiresAuthMock,
}))

const { protectedHandler } =
	await import("../../../src/middleware/protectedHandler.js")

describe("protectedHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("authenticates once and calls the handler with assigned identity", async () => {
		requiresAuthMock.mockImplementation((request, _response, next) => {
			request.userId = "user-123"
			request.sessionId = "session-123"
			next()
		})

		const handler = vi.fn()
		const route = protectedHandler(handler)
		const request = { body: {} } as Request
		const response = {} as Response
		const next = vi.fn()

		route(request, response, next)
		await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce())

		expect(requiresAuthMock).toHaveBeenCalledOnce()
		expect(handler.mock.calls[0][0]).toMatchObject({
			userId: "user-123",
			sessionId: "session-123",
		})
		expect(next).not.toHaveBeenCalled()
	})

	it("does not call the handler when auth fails", () => {
		const authError = new AppError(401, "Authentication required")
		requiresAuthMock.mockImplementation((_request, _response, next) => {
			next(authError)
		})

		const handler = vi.fn()
		const route = protectedHandler(handler)
		const next = vi.fn()

		route({ body: {} } as Request, {} as Response, next)

		expect(handler).not.toHaveBeenCalled()
		expect(next).toHaveBeenCalledWith(authError)
	})

	it("fails closed if auth calls next without assigning identity", () => {
		requiresAuthMock.mockImplementation((_request, _response, next) => {
			next()
		})

		const handler = vi.fn()
		const route = protectedHandler(handler)
		const next = vi.fn()

		route({ body: {} } as Request, {} as Response, next)

		expect(handler).not.toHaveBeenCalled()
		expect(next).toHaveBeenCalledWith(
			expect.objectContaining({
				statusCode: 401,
				message: "Authentication required",
			})
		)
	})
})
