import { beforeEach, expect, jest, describe, it } from "@jest/globals"

const mockPrisma = {
	user: {
		findUnique: jest.fn(),
		create: jest.fn(),
	},
	session: {
		update: jest.fn(),
	},
}

const mockBcrypt = {
	hash: jest.fn(),
	compare: jest.fn(),
}

const mockCreateSessionAndToken = jest.fn()
const mockPublicUser = jest.fn()
const mockAddEmailJob = jest.fn()

jest.unstable_mockModule("../../../../src/database/prisma.js", () => ({
	prisma: mockPrisma,
}))

jest.unstable_mockModule("bcryptjs", () => ({
	default: mockBcrypt,
}))

jest.unstable_mockModule("../../../../src/helpers/index.js", () => ({
	createSessionAndToken: mockCreateSessionAndToken,
	publicUser: mockPublicUser,
}))

jest.unstable_mockModule("../../../../src/jobs/emailQueue.js", () => ({
	addEmailJob: mockAddEmailJob,
}))

const { register, login, logout, me } =
	await import("../../../../src/controllers/auth/auth.controller.js")

describe("Auth Controller", () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	describe("register", () => {
		it("registers a new user successfully", async () => {
			const request = {
				body: {
					username: "john",
					email: "john@example.com",
					password: "password123",
				},
			} as any

			const response = {
				status: jest.fn().mockReturnThis(),
				json: jest.fn().mockReturnThis(),
			} as any

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

			await register(request, response)

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
			const request = {
				body: {
					username: "john",
					email: "john@example.com",
					password: "password123",
				},
			} as any

			const response = {} as any

			mockPrisma.user.findUnique.mockResolvedValue({
				id: "existing-user",
				email: "john@example.com",
			})

			await expect(register(request, response)).rejects.toThrow(
				"User already exists"
			)

			expect(mockBcrypt.hash).not.toHaveBeenCalled()
			expect(mockPrisma.user.create).not.toHaveBeenCalled()
			expect(mockAddEmailJob).not.toHaveBeenCalled()
		})
	})

	describe("login", () => {
		it("logs in successfully", async () => {
			const request = {
				body: {
					email: "john@example.com",
					password: "password123",
				},
			} as any

			const response = {
				status: jest.fn().mockReturnThis(),
				json: jest.fn().mockReturnThis(),
			} as any

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

			await login(request, response)

			expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
				where: { email: "john@example.com" },
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
			const request = {
				body: {
					email: "unknown@example.com",
					password: "password123",
				},
			} as any

			const response = {} as any

			mockPrisma.user.findUnique.mockResolvedValue(null)

			await expect(login(request, response)).rejects.toThrow(
				"Invalid email or password"
			)

			expect(mockBcrypt.compare).not.toHaveBeenCalled()
			expect(mockCreateSessionAndToken).not.toHaveBeenCalled()
		})

		it("rejects an incorrect password", async () => {
			const request = {
				body: {
					email: "john@example.com",
					password: "wrong-password",
				},
			} as any

			const response = {} as any

			mockPrisma.user.findUnique.mockResolvedValue({
				id: "user-123",
				email: "john@example.com",
				passwordHash: "hashed-password",
			})

			mockBcrypt.compare.mockResolvedValue(false)

			await expect(login(request, response)).rejects.toThrow(
				"Invalid email or password"
			)

			expect(mockCreateSessionAndToken).not.toHaveBeenCalled()
		})
	})

	describe("logout", () => {
		it("revokes the current session", async () => {
			const request = {
				sessionId: "session-123",
			} as any

			const response = {
				status: jest.fn().mockReturnThis(),
				json: jest.fn().mockReturnThis(),
			} as any

			mockPrisma.session.update.mockResolvedValue({
				id: "session-123",
			})

			await logout(request, response)

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

		it("succeeds without a session id", async () => {
			const request = {
				sessionId: undefined,
			} as any

			const response = {
				status: jest.fn().mockReturnThis(),
				json: jest.fn().mockReturnThis(),
			} as any

			await logout(request, response)

			expect(mockPrisma.session.update).not.toHaveBeenCalled()

			expect(response.status).toHaveBeenCalledWith(200)

			expect(response.json).toHaveBeenCalledWith({
				message: "Logout successful",
			})
		})
	})

	describe("me", () => {
		it("returns the authenticated user and creates a new token", async () => {
			const request = {
				userId: "user-123",
			} as any

			const response = {
				status: jest.fn().mockReturnThis(),
				json: jest.fn().mockReturnThis(),
			} as any

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

			await me(request, response)

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

		it("rejects when there is no authenticated user", async () => {
			const request = {
				userId: undefined,
			} as any

			const response = {} as any

			await expect(me(request, response)).rejects.toThrow(
				"Authentication required"
			)

			expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
		})

		it("throws when the authenticated user does not exist", async () => {
			const request = {
				userId: "user-123",
			} as any

			const response = {} as any

			mockPrisma.user.findUnique.mockResolvedValue(null)

			await expect(me(request, response)).rejects.toThrow(
				"User not found"
			)

			expect(mockCreateSessionAndToken).not.toHaveBeenCalled()
		})
	})
})
