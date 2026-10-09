import type { RequestHandler } from "express"
import {
	changePasswordSchema,
	confirmPasswordResetBodySchema,
	confirmPasswordResetTokenSchema,
	resetPasswordSchema,
} from "../../validations/auth.schemas.js"
import { prisma } from "../../database/prisma.js"
import { AppError } from "../../errors/AppError.js"
import bcrypt from "bcryptjs"
import { createHash, randomBytes } from "crypto"
import { addEmailJob } from "../../jobs/emailQueue.js"
import { env } from "../../configs/env.js"
import type { AuthenticatedHandler } from "../../middleware/protectedHandler.js"

export const changePassword: AuthenticatedHandler = async (request, response) => {
	const userId = request.userId

	const { current_password, password } = changePasswordSchema.parse(
		request.body
	)

	const user = await prisma.user.findUnique({
		where: { id: userId },
	})

	if (!user) throw new AppError(404, "Error fetching user")

	const isCurrentPasswordValid = await bcrypt.compare(
		current_password,
		user.passwordHash
	)

	if (!isCurrentPasswordValid) {
		throw new AppError(401, "Current password is incorrect")
	}

	const passwordHash = await bcrypt.hash(password, 12)

	await prisma.user.update({
		where: { id: user.id },
		data: { passwordHash },
	})

	return response.status(200).json({
		message: "Password updated successfully",
	})
}

export const resetPassword: RequestHandler = async (request, response) => {
	const { email } = resetPasswordSchema.parse(request.body)

	const user = await prisma.user.findUnique({
		where: { email },
	})

	if (user) {
		const token = randomBytes(32).toString("hex")
		const tokenHash = createHash("sha256").update(token).digest("hex")

		await prisma.$transaction(async (tx) => {
			await tx.passwordResetToken.deleteMany({
				where: { email: user.email },
			})

			await tx.passwordResetToken.create({
				data: {
					email: user.email,
					tokenHash,
					expiresAt: new Date(Date.now() + 60 * 60 * 1000),
				},
			})
		})

		await addEmailJob("password-reset", { email: user.email, token })
	}

	response.status(200).json({
		message:
			"If an account with that email exists, a reset link has been sent.",
	})
}

export const confirmPasswordReset: RequestHandler = async (
	request,
	response
) => {
	const { token } = confirmPasswordResetTokenSchema.parse(request.params)
	const { password } = confirmPasswordResetBodySchema.parse(request.body)

	const tokenHash = createHash("sha256").update(token).digest("hex")

	const resetToken = await prisma.passwordResetToken.findFirst({
		where: { tokenHash, expiresAt: { gt: new Date() } },
	})

	if (!resetToken)
		throw new AppError(400, "Invalid or expired password reset token")

	const passwordHash = await bcrypt.hash(password, 12)

	const user = await prisma.$transaction(async (tx) => {
		const user = await tx.user.update({
			where: { email: resetToken.email },
			data: { passwordHash },
		})

		await tx.passwordResetToken.delete({
			where: { id: resetToken.id },
		})

		return user
	})

	await addEmailJob("password-reset-success", {
		email: user.email,
		name: user.username,
		appName: env.APP_NAME,
	})

	return response.status(200).json({ message: "Passord reset successfully" })
}
