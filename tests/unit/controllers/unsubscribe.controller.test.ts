import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	createControllerTestResponse,
	invokeController,
	type ControllerTestRequest,
} from "../../helpers/controller-test.js"

const mockPrisma = {
	user: {
		updateMany: vi.fn(),
	},
}

vi.mock("../../../src/database/prisma.js", () => ({ prisma: mockPrisma }))

vi.mock("../../../src/configs/env.js", () => ({
	env: {
		FRONTEND_URL: "https://frontend.example.test",
	},
}))

const { unsubscribe, unsubscribeOneClick } = await import(
	"../../../src/controllers/unsubscribe.controller.js"
)

const TOKEN = "unsubscribe-token-abc123"

describe("Unsubscribe Controller", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockPrisma.user.updateMany.mockResolvedValue({ count: 1 })
	})

	describe("unsubscribe (GET)", () => {
		it("flips unsubscribedAt and redirects to the frontend", async () => {
			const request: ControllerTestRequest<Record<string, never>> = {
				body: {},
				params: { token: TOKEN },
			}
			const response = createControllerTestResponse()
			const redirect = vi.fn()
			Object.assign(response, { redirect })

			await invokeController(unsubscribe, request, response)

			expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
				where: { unsubscribeToken: TOKEN, unsubscribedAt: null },
				data: { unsubscribedAt: expect.any(Date) },
			})
			expect(redirect).toHaveBeenCalledWith(
				"https://frontend.example.test/unsubscribed"
			)
		})

		it("still redirects even when the token matches no user", async () => {
			mockPrisma.user.updateMany.mockResolvedValue({ count: 0 })

			const request: ControllerTestRequest<Record<string, never>> = {
				body: {},
				params: { token: "unknown" },
			}
			const response = createControllerTestResponse()
			const redirect = vi.fn()
			Object.assign(response, { redirect })

			await invokeController(unsubscribe, request, response)

			expect(redirect).toHaveBeenCalledWith(
				"https://frontend.example.test/unsubscribed"
			)
		})

		it("422s on an empty token param", async () => {
			const request: ControllerTestRequest<Record<string, never>> = {
				body: {},
				params: { token: "" },
			}

			await expect(
				invokeController(
					unsubscribe,
					request,
					createControllerTestResponse()
				)
			).rejects.toBeDefined()
		})
	})

	describe("unsubscribeOneClick (POST)", () => {
		it("flips unsubscribedAt and returns 200 with no body", async () => {
			const request: ControllerTestRequest<Record<string, never>> = {
				body: {},
				params: { token: TOKEN },
			}
			const response = createControllerTestResponse()

			await invokeController(unsubscribeOneClick, request, response)

			expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
				where: { unsubscribeToken: TOKEN, unsubscribedAt: null },
				data: { unsubscribedAt: expect.any(Date) },
			})
			expect(response.status).toHaveBeenCalledWith(200)
			expect(response.send).toHaveBeenCalled()
		})
	})
})
