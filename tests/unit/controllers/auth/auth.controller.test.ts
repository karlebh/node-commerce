import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	createControllerTestResponse,
	invokeController,
	type ControllerTestRequest,
} from "../../../helpers/controller-test.js"

type RegisterBody = {
	username: string
	email: string
	password: string
	password_confirmation?: string
	passwordConfirmation?: string
}

type LoginBody = {
	email: string
	password: string
}

const mockPrisma = {
	user: {
		findUnique: vi.fn(),
		create: vi.fn(),
	},
	session: {
		update: vi.fn(),
	},
}

const mockBcrypt = {
	hash: vi.fn(),
	compare: vi.fn(),
}

const mockCreateSessionAndToken = vi.fn()
const mockPublicUser = vi.fn()
const mockAddEmailJob = vi.fn()

vi.mock("../../../../src/database/prisma.js", () => ({
	prisma: mockPrisma,
}))

vi.mock("bcryptjs", () => ({
	default: mockBcrypt,
}))

vi.mock("../../../../src/helpers/index.js", () => ({
	createSessionAndToken: mockCreateSessionAndToken,
	publicUser: mockPublicUser,
}))

vi.mock("../../../../src/jobs/emailQueue.js", () => ({
	addEmailJob: mockAddEmailJob,
}))

const { register, login, logout, me } =
	await import("../../../../src/controllers/auth/auth.controller.js")

describe("Auth Controller", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("register", () => {
		it("registers a new user successfully", async () => {
			const request: ControllerTestRequest<RegisterBody> = {
				body: {
					username: "john",
					email: "john@example.com",
					password: "password123",
				},
			}

			const response = createControllerTestResponse()

			const user = {
				id: "user-123",
				username: "john",
				email: "john@example.com",
				passwordHash: "hashed-password",
			}

			const publicUser = {
				id: "user-123",
				username: "john",
				email: "john@example.com",
			}

			mockPrisma.user.findUnique.mockResolvedValue(null)
			mockBcrypt.hash.mockResolvedValue("hashed-password")
			mockPrisma.user.create.mockResolvedValue(user)
			mockCreateSessionAndToken.mockResolvedValue("jwt-token")
			mockPublicUser.mockReturnValue(publicUser)

			await invokeController(register, request, response)

			expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
				where: { email: "john@example.com" },
			})

			expect(mockBcrypt.hash).toHaveBeenCalledWith("password123", 12)

			expect(mockPrisma.user.create).toHaveBeenCalledWith({
				data: {
					username: "john",
					email: "john@example.com",
					passwordHash: "hashed-password",
				},
			})

			expect(mockCreateSessionAndToken).toHaveBeenCalledWith("user-123")

			expect(mockAddEmailJob).toHaveBeenCalledWith("register", {
				email: "john@example.com",
				name: "john",
			})

			expect(response.status).toHaveBeenCalledWith(201)

			expect(response.json).toHaveBeenCalledWith({
				data: {
					user: publicUser,
					token: "jwt-token",
				},
			})
		})

		it("throws when the user already exists", async () => {
			const request: ControllerTestRequest<RegisterBody> = {
				body: {
					username: "john",
					email: "john@example.com",
					password: "password123",
				},
			}

			const response = createControllerTestResponse()

			mockPrisma.user.findUnique.mockResolvedValue({
				id: "existing-user",
				email: "john@example.com",
			})

			await expect(
				invokeController(register, request, response)
			).rejects.toThrow(
				"User already exists"
			)

			expect(mockBcrypt.hash).not.toHaveBeenCalled()
			expect(mockPrisma.user.create).not.toHaveBeenCalled()
			expect(mockAddEmailJob).not.toHaveBeenCalled()
		})
	})

	describe("login", () => {
		it("logs in successfully", async () => {
			const request: ControllerTestRequest<LoginBody> = {
				body: {
					email: "john@example.com",
					password: "password123",
				},
			}

			const response = createControllerTestResponse()

			const user = {
				id: "user-123",
				username: "john",
				email: "john@example.com",
				passwordHash: "hashed-password",
			}

			const publicUser = {
				id: "user-123",
				username: "john",
				email: "john@example.com",
			}

			mockPrisma.user.findUnique.mockResolvedValue(user)
			mockBcrypt.compare.mockResolvedValue(true)
			mockCreateSessionAndToken.mockResolvedValue("jwt-token")
			mockPublicUser.mockReturnValue(publicUser)

			await invokeController(login, request, response)

			expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
				where: { email: "john@example.com" },
				omit: { passwordHash: false },
			})

			expect(mockBcrypt.compare).toHaveBeenCalledWith(
				"password123",
				"hashed-password"
			)

			expect(mockCreateSessionAndToken).toHaveBeenCalledWith("user-123")

			expect(response.status).toHaveBeenCalledWith(200)

			expect(response.json).toHaveBeenCalledWith({
				message: "Login successful",
				data: {
					user: publicUser,
					token: "jwt-token",
				},
			})
		})

		it("rejects an unknown email", async () => {
			const request: ControllerTestRequest<LoginBody> = {
				body: {
					email: "unknown@example.com",
					password: "password123",
				},
			}

			const response = createControllerTestResponse()

			mockPrisma.user.findUnique.mockResolvedValue(null)

			await expect(
				invokeController(login, request, response)
			).rejects.toThrow(
				"Invalid email or password"
			)

			expect(mockBcrypt.compare).not.toHaveBeenCalled()
			expect(mockCreateSessionAndToken).not.toHaveBeenCalled()
		})

		it("rejects an incorrect password", async () => {
			const request: ControllerTestRequest<LoginBody> = {
				body: {
					email: "john@example.com",
					password: "wrong-password",
				},
			}

			const response = createControllerTestResponse()

			mockPrisma.user.findUnique.mockResolvedValue({
				id: "user-123",
				email: "john@example.com",
				passwordHash: "hashed-password",
			})

			mockBcrypt.compare.mockResolvedValue(false)

			await expect(
				invokeController(login, request, response)
			).rejects.toThrow(
				"Invalid email or password"
			)

			expect(mockCreateSessionAndToken).not.toHaveBeenCalled()
		})
	})

	describe("logout", () => {
		it("revokes the current session", async () => {
			const request: ControllerTestRequest = {
				body: {},
				sessionId: "session-123",
			}

			const response = createControllerTestResponse()

			mockPrisma.session.update.mockResolvedValue({
				id: "session-123",
			})

			await invokeController(logout, request, response)

			expect(mockPrisma.session.update).toHaveBeenCalledWith({
				where: { id: "session-123" },
				data: {
					revokedAt: expect.any(Date),
				},
			})

			expect(response.status).toHaveBeenCalledWith(200)

			expect(response.json).toHaveBeenCalledWith({
				message: "Logout successful",
			})
		})

	})

	describe("me", () => {
		it("returns the authenticated user and creates a new token", async () => {
			const request: ControllerTestRequest = {
				body: {},
				userId: "user-123",
			}

			const response = createControllerTestResponse()

			const user = {
				id: "user-123",
				username: "john",
				email: "john@example.com",
				passwordHash: "hashed-password",
			}

			const publicUser = {
				id: "user-123",
				username: "john",
				email: "john@example.com",
			}

			mockPrisma.user.findUnique.mockResolvedValue(user)
			mockCreateSessionAndToken.mockResolvedValue("new-jwt-token")
			mockPublicUser.mockReturnValue(publicUser)

			await invokeController(me, request, response)

			expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
				where: { id: "user-123" },
			})

			expect(mockCreateSessionAndToken).toHaveBeenCalledWith("user-123")

			expect(response.status).toHaveBeenCalledWith(200)

			expect(response.json).toHaveBeenCalledWith({
				data: {
					user: publicUser,
					token: "new-jwt-token",
				},
			})
		})

		it("throws when the authenticated user does not exist", async () => {
			const request: ControllerTestRequest = {
				body: {},
				userId: "user-123",
			}

			const response = createControllerTestResponse()

			mockPrisma.user.findUnique.mockResolvedValue(null)

			await expect(
				invokeController(me, request, response)
			).rejects.toThrow(
				"User not found"
			)

			expect(mockCreateSessionAndToken).not.toHaveBeenCalled()
		})
	})
})
