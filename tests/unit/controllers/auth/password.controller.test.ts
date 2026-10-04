import { beforeEach, describe, expect, it, jest } from "@jest/globals"

const mockPrisma = {
	user: {
		findUnique: jest.fn(),
		update: jest.fn(),
	},
	passwordResetToken: {
		deleteMany: jest.fn(),
		create: jest.fn(),
		findFirst: jest.fn(),
		delete: jest.fn(),
	},
	$transaction: jest.fn(),
}

const mockBcrypt = {
	compare: jest.fn(),
	hash: jest.fn(),
}

const mockAddEmailJob = jest.fn()

jest.unstable_mockModule("../../database/prisma.js", () => ({
	prisma: mockPrisma,
}))

jest.unstable_mockModule("bcryptjs", () => ({
	default: mockBcrypt,
}))

jest.unstable_mockModule("../../jobs/emailQueue.js", () => ({
	addEmailJob: mockAddEmailJob,
}))

jest.unstable_mockModule("../../configs/env.js", () => ({
	env: {
		APP_NAME: "My Backend",
	},
}))

const { changePassword, resetPassword, confirmPasswordReset } =
	await import("./password.controller.js")

describe("Password Controller", () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	describe("changePassword", () => {
		it("changes the user's password", async () => {
			const request = {
				userId: "user-123",
				body: {
					current_password: "old-password",
					password: "new-password",
				},
			} as any

			const response = {
				status: jest.fn().mockReturnThis(),
				json: jest.fn().mockReturnThis(),
			} as any

			mockPrisma.user.findUnique.mockResolvedValue({
				id: "user-123",
				email: "john@example.com",
				passwordHash: "old-hash",
			})

			mockBcrypt.compare.mockResolvedValue(true)
			mockBcrypt.hash.mockResolvedValue("new-hash")

			await changePassword(request, response)

			expect(mockBcrypt.compare).toHaveBeenCalledWith(
				"old-password",
				"old-hash"
			)

			expect(mockBcrypt.hash).toHaveBeenCalledWith("new-password", 12)

			expect(mockPrisma.user.update).toHaveBeenCalledWith({
				where: { id: "user-123" },
				data: { passwordHash: "new-hash" },
			})

			expect(response.status).toHaveBeenCalledWith(200)

			expect(response.json).toHaveBeenCalledWith({
				message: "Password updated successfully",
			})
		})

		it("throws when the user does not exist", async () => {
			const request = {
				userId: "user-123",
				body: {
					current_password: "old-password",
					password: "new-password",
				},
			} as any

			const response = {} as any

			mockPrisma.user.findUnique.mockResolvedValue(null)

			await expect(changePassword(request, response)).rejects.toThrow(
				"Error fetching user"
			)

			expect(mockPrisma.user.update).not.toHaveBeenCalled()
		})

		it("throws when the current password is incorrect", async () => {
			const request = {
				userId: "user-123",
				body: {
					current_password: "wrong-password",
					password: "new-password",
				},
			} as any

			const response = {} as any

			mockPrisma.user.findUnique.mockResolvedValue({
				id: "user-123",
				passwordHash: "old-hash",
			})

			mockBcrypt.compare.mockResolvedValue(false)

			await expect(changePassword(request, response)).rejects.toThrow(
				"Current password is incorrect"
			)

			expect(mockBcrypt.hash).not.toHaveBeenCalled()
			expect(mockPrisma.user.update).not.toHaveBeenCalled()
		})
	})

	describe("resetPassword", () => {
		it("creates a reset token and queues the reset email", async () => {
			const request = {
				body: {
					email: "john@example.com",
				},
			} as any

			const response = {
				status: jest.fn().mockReturnThis(),
				json: jest.fn().mockReturnThis(),
			} as any

			const tx = {
				passwordResetToken: {
					deleteMany: jest.fn(),
					create: jest.fn(),
				},
			}

			mockPrisma.user.findUnique.mockResolvedValue({
				id: "user-123",
				email: "john@example.com",
			})

			mockPrisma.$transaction.mockImplementation(async (callback: any) =>
				callback(tx)
			)

			await resetPassword(request, response)

			expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
				where: { email: "john@example.com" },
			})

			expect(tx.passwordResetToken.deleteMany).toHaveBeenCalledWith({
				where: { email: "john@example.com" },
			})

			expect(tx.passwordResetToken.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						email: "john@example.com",
						tokenHash: expect.any(String),
						expiresAt: expect.any(Date),
					}),
				})
			)

			expect(mockAddEmailJob).toHaveBeenCalledWith(
				"password-reset",
				expect.objectContaining({
					email: "john@example.com",
					token: expect.any(String),
				})
			)

			expect(response.status).toHaveBeenCalledWith(200)

			expect(response.json).toHaveBeenCalledWith({
				message:
					"If an account with that email exists, a reset link has been sent.",
			})
		})

		it("does not reveal whether the email exists", async () => {
			const request = {
				body: {
					email: "unknown@example.com",
				},
			} as any

			const response = {
				status: jest.fn().mockReturnThis(),
				json: jest.fn().mockReturnThis(),
			} as any

			mockPrisma.user.findUnique.mockResolvedValue(null)

			await resetPassword(request, response)

			expect(mockPrisma.$transaction).not.toHaveBeenCalled()
			expect(mockAddEmailJob).not.toHaveBeenCalled()

			expect(response.status).toHaveBeenCalledWith(200)

			expect(response.json).toHaveBeenCalledWith({
				message:
					"If an account with that email exists, a reset link has been sent.",
			})
		})
	})

	describe("confirmPasswordReset", () => {
		it("resets the password and deletes the reset token", async () => {
			const request = {
				params: {
					token: "plain-reset-token",
				},
				body: {
					password: "new-password",
				},
			} as any

			const response = {
				status: jest.fn().mockReturnThis(),
				json: jest.fn().mockReturnThis(),
			} as any

			const resetToken = {
				id: "reset-token-123",
				email: "john@example.com",
				tokenHash: "hashed-token",
				createdAt: new Date(),
				expiresAt: new Date(Date.now() + 60 * 60 * 1000),
			}

			const tx = {
				user: {
					update: jest.fn(),
				},
				passwordResetToken: {
					delete: jest.fn(),
				},
			}

			const updatedUser = {
				id: "user-123",
				email: "john@example.com",
				username: "john",
			}

			mockPrisma.passwordResetToken.findFirst.mockResolvedValue(
				resetToken
			)

			mockBcrypt.hash.mockResolvedValue("new-password-hash")

			tx.user.update.mockResolvedValue(updatedUser)

			mockPrisma.$transaction.mockImplementation(async (callback: any) =>
				callback(tx)
			)

			await confirmPasswordReset(request, response)

			expect(mockBcrypt.hash).toHaveBeenCalledWith("new-password", 12)

			expect(tx.user.update).toHaveBeenCalledWith({
				where: { email: "john@example.com" },
				data: { passwordHash: "new-password-hash" },
			})

			expect(tx.passwordResetToken.delete).toHaveBeenCalledWith({
				where: { id: "reset-token-123" },
			})

			expect(mockAddEmailJob).toHaveBeenCalledWith(
				"password-reset-success",
				{
					email: "john@example.com",
					name: "john",
					appName: "My Backend",
				}
			)

			expect(response.status).toHaveBeenCalledWith(200)

			expect(response.json).toHaveBeenCalledWith({
				message: "Passord reset successfully",
			})
		})

		it("rejects an invalid or expired reset token", async () => {
			const request = {
				params: {
					token: "invalid-token",
				},
				body: {
					password: "new-password",
				},
			} as any

			const response = {} as any

			mockPrisma.passwordResetToken.findFirst.mockResolvedValue(null)

			await expect(
				confirmPasswordReset(request, response)
			).rejects.toThrow("Invalid or expired password reset token")

			expect(mockBcrypt.hash).not.toHaveBeenCalled()
			expect(mockPrisma.$transaction).not.toHaveBeenCalled()
			expect(mockAddEmailJob).not.toHaveBeenCalled()
		})
	})
})
