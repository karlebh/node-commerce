import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	createControllerTestResponse,
	invokeController,
	type ControllerTestRequest,
} from "../../../helpers/controller-test.js"

type ChangePasswordBody = {
	current_password: string
	password: string
	password_confirmation?: string
	passwordConfirmation?: string
}

type ResetPasswordBody = {
	email: string
}

type ConfirmPasswordResetBody = {
	password: string
	password_confirmation?: string
	passwordConfirmation?: string
}

type ResetTokenParams = {
	token: string
}

type ResetTokenTransaction = {
	passwordResetToken: {
		deleteMany: ReturnType<typeof vi.fn>
		create: ReturnType<typeof vi.fn>
	}
}

type ConfirmResetTransaction = {
	user: {
		update: ReturnType<typeof vi.fn>
	}
	passwordResetToken: {
		delete: ReturnType<typeof vi.fn>
	}
}

const mockPrisma = {
	user: {
		findUnique: vi.fn(),
		update: vi.fn(),
	},
	passwordResetToken: {
		deleteMany: vi.fn(),
		create: vi.fn(),
		findFirst: vi.fn(),
		delete: vi.fn(),
	},
	$transaction: vi.fn(),
}

const mockBcrypt = {
	compare: vi.fn(),
	hash: vi.fn(),
}

const mockAddEmailJob = vi.fn()

vi.mock("../../../../src/database/prisma.js", () => ({
	prisma: mockPrisma,
}))

vi.mock("bcryptjs", () => ({
	default: mockBcrypt,
}))

vi.mock("../../../../src/jobs/emailQueue.js", () => ({
	addEmailJob: mockAddEmailJob,
}))

vi.mock("../../../../src/configs/env.js", () => ({
	env: {
		APP_NAME: "My Backend",
	},
}))

const { changePassword, resetPassword, confirmPasswordReset } =
	await import("../../../../src/controllers/auth/password.controller.js")

describe("Password Controller", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("changePassword", () => {
		it("changes the user's password", async () => {
			const request: ControllerTestRequest<ChangePasswordBody> = {
				userId: "user-123",
				body: {
					current_password: "old-password",
					password: "new-password",
				},
			}

			const response = createControllerTestResponse()

			mockPrisma.user.findUnique.mockResolvedValue({
				id: "user-123",
				email: "john@example.com",
				passwordHash: "old-hash",
			})

			mockBcrypt.compare.mockResolvedValue(true)
			mockBcrypt.hash.mockResolvedValue("new-hash")

			await invokeController(changePassword, request, response)

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
			const request: ControllerTestRequest<ChangePasswordBody> = {
				userId: "user-123",
				body: {
					current_password: "old-password",
					password: "new-password",
				},
			}

			const response = createControllerTestResponse()

			mockPrisma.user.findUnique.mockResolvedValue(null)

			await expect(
				invokeController(changePassword, request, response)
			).rejects.toThrow("Error fetching user")

			expect(mockPrisma.user.update).not.toHaveBeenCalled()
		})

		it("throws when the current password is incorrect", async () => {
			const request: ControllerTestRequest<ChangePasswordBody> = {
				userId: "user-123",
				body: {
					current_password: "wrong-password",
					password: "new-password",
				},
			}

			const response = createControllerTestResponse()

			mockPrisma.user.findUnique.mockResolvedValue({
				id: "user-123",
				passwordHash: "old-hash",
			})

			mockBcrypt.compare.mockResolvedValue(false)

			await expect(
				invokeController(changePassword, request, response)
			).rejects.toThrow("Current password is incorrect")

			expect(mockBcrypt.hash).not.toHaveBeenCalled()
			expect(mockPrisma.user.update).not.toHaveBeenCalled()
		})
	})

	describe("resetPassword", () => {
		it("creates a reset token and queues the reset email", async () => {
			const request: ControllerTestRequest<ResetPasswordBody> = {
				body: {
					email: "john@example.com",
				},
			}

			const response = createControllerTestResponse()

			const tx: ResetTokenTransaction = {
				passwordResetToken: {
					deleteMany: vi.fn(),
					create: vi.fn(),
				},
			}

			mockPrisma.user.findUnique.mockResolvedValue({
				id: "user-123",
				email: "john@example.com",
			})

			mockPrisma.$transaction.mockImplementation(
				(callback: (transaction: ResetTokenTransaction) => Promise<unknown>) =>
					callback(tx)
			)

			await invokeController(resetPassword, request, response)

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
			const request: ControllerTestRequest<ResetPasswordBody> = {
				body: {
					email: "unknown@example.com",
				},
			}

			const response = createControllerTestResponse()

			mockPrisma.user.findUnique.mockResolvedValue(null)

			await invokeController(resetPassword, request, response)

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
			const request: ControllerTestRequest<
				ConfirmPasswordResetBody
			> = {
				params: {
					token: "plain-reset-token",
				},
				body: {
					password: "new-password",
				},
			}

			const response = createControllerTestResponse()

			const resetToken = {
				id: "reset-token-123",
				email: "john@example.com",
				tokenHash: "hashed-token",
				createdAt: new Date(),
				expiresAt: new Date(Date.now() + 60 * 60 * 1000),
			}

			const tx: ConfirmResetTransaction = {
				user: {
					update: vi.fn(),
				},
				passwordResetToken: {
					delete: vi.fn(),
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

			mockPrisma.$transaction.mockImplementation(
				(callback: (transaction: ConfirmResetTransaction) => Promise<unknown>) =>
					callback(tx)
			)

			await invokeController(confirmPasswordReset, request, response)

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
			const request: ControllerTestRequest<
				ConfirmPasswordResetBody
			> & {
				params: ResetTokenParams
			} = {
				params: {
					token: "invalid-token",
				},
				body: {
					password: "new-password",
				},
			}

			const response = createControllerTestResponse()

			mockPrisma.passwordResetToken.findFirst.mockResolvedValue(null)

			await expect(
				invokeController(confirmPasswordReset, request, response)
			).rejects.toThrow("Invalid or expired password reset token")

			expect(mockBcrypt.hash).not.toHaveBeenCalled()
			expect(mockPrisma.$transaction).not.toHaveBeenCalled()
			expect(mockAddEmailJob).not.toHaveBeenCalled()
		})
	})
})
