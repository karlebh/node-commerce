import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	createControllerTestResponse,
	invokeController,
	type ControllerTestRequest,
} from "../../../helpers/controller-test.js"

const mockCreateSessionAndToken = vi.fn()

vi.mock("../../../../src/helpers/index.js", () => ({
	createSessionAndToken: mockCreateSessionAndToken,
}))

vi.mock("../../../../src/configs/env.js", () => ({
	env: {
		FRONTEND_URL: "http://localhost:5173",
	},
}))

vi.mock("passport", () => ({
	default: {
		authenticate: vi.fn(
			() => (_req: unknown, _res: unknown, _next: unknown) => {}
		),
	},
}))

const { callback } =
	await import("../../../../src/controllers/oauth/google.controller.js")

describe("google oauth controller — callback", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("mints a session token and redirects to the frontend with the token", async () => {
		mockCreateSessionAndToken.mockResolvedValueOnce("jwt-token")

		const redirect = vi.fn()
		const request: ControllerTestRequest<Record<string, never>> & {
			user: { id: string }
		} = {
			body: {},
			user: { id: "user-1" },
		}
		const response = {
			...createControllerTestResponse(),
			redirect,
		}

		await invokeController(
			callback,
			request,
			response as unknown as ReturnType<
				typeof createControllerTestResponse
			>
		)

		expect(mockCreateSessionAndToken).toHaveBeenCalledWith("user-1")
		expect(redirect).toHaveBeenCalledWith(
			"http://localhost:5173/oauth/callback?token=jwt-token"
		)
	})

	it("throws 401 when passport did not populate req.user", async () => {
		const response = {
			...createControllerTestResponse(),
			redirect: vi.fn(),
		}

		await expect(
			invokeController(
				callback,
				{ body: {} },
				response as unknown as ReturnType<
					typeof createControllerTestResponse
				>
			)
		).rejects.toThrow("Google authentication failed")

		expect(mockCreateSessionAndToken).not.toHaveBeenCalled()
	})

	it("URL-encodes the token in the redirect", async () => {
		mockCreateSessionAndToken.mockResolvedValueOnce("a b/c?d=e")

		const redirect = vi.fn()
		const response = {
			...createControllerTestResponse(),
			redirect,
		}

		await invokeController(
			callback,
			{
				body: {},
				user: { id: "u1" },
			} as unknown as ControllerTestRequest<Record<string, never>>,
			response as unknown as ReturnType<
				typeof createControllerTestResponse
			>
		)

		expect(redirect).toHaveBeenCalledWith(
			"http://localhost:5173/oauth/callback?token=a%20b%2Fc%3Fd%3De"
		)
	})
})
