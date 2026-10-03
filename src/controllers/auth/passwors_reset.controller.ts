import type { RequestHandler } from "express"
import {
	changePasswordSchema,
	resetPasswordSchema,
} from "../../validations/auth.schemas.js"
import { prisma } from "../../database/prisma.js"
import { AppError } from "../../errors/AppError.js"
import bcrypt from "bcryptjs"
import { createHash, randomBytes } from "crypto"
import { sendPasswordResetEmail } from "../../emails/mailer.js"

export const changePassword: RequestHandler = async (request, response) => {
	const { current_password, password } = changePasswordSchema.parse(
		request.body
	)

	const user = await prisma.user.findUnique({
		where: { id: request.userId! },
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

		await prisma.passwordResetToken.deleteMany({
			where: { email: user.email },
		})

		await prisma.passwordResetToken.create({
			data: {
				email: user.email,
				tokenHash,
				expiresAt: new Date(Date.now() + 60 * 60 * 1000),
			},
		})

		await sendPasswordResetEmail(user.email, token)
	}

	response.status(200).json({
		message:
			"If an account with that email exists, a reset link has been sent.",
	})
}
