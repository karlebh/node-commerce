import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	createControllerTestResponse,
	invokeController,
	type ControllerTestRequest,
} from "../../../../helpers/controller-test.js"

const mockCreateSessionAndToken = vi.fn()

vi.mock("../../../../../src/helpers/index.js", () => ({
	createSessionAndToken: mockCreateSessionAndToken,
}))

vi.mock("../../../../../src/configs/env.js", () => ({
	env: {
		FRONTEND_URL: "http://localhost:5173",
	},
}))

vi.mock("passport", () => ({
	default: {
		authenticate: vi.fn(() => (_req: unknown, _res: unknown, _next: unknown) => {}),
	},
}))

const { callback } = await import(
	"../../../../../src/controllers/oauth/github.controller.js"
)

describe("github oauth controller — callback", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("mints a session token and redirects to the frontend with the token", async () => {
		mockCreateSessionAndToken.mockResolvedValueOnce("gh-token")

		const redirect = vi.fn()
		const response = {
			...createControllerTestResponse(),
			redirect,
		}

		await invokeController(
			callback,
			{
				body: {},
				user: { id: "user-2" },
			} as unknown as ControllerTestRequest<Record<string, never>>,
			response as unknown as ReturnType<
				typeof createControllerTestResponse
			>
		)

		expect(mockCreateSessionAndToken).toHaveBeenCalledWith("user-2")
		expect(redirect).toHaveBeenCalledWith(
			"http://localhost:5173/oauth/callback?token=gh-token"
		)
	})

	it("throws 401 when req.user is missing", async () => {
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
		).rejects.toThrow("GitHub authentication failed")

		expect(mockCreateSessionAndToken).not.toHaveBeenCalled()
	})
})
