import bcrypt from "bcryptjs"
import { response, type RequestHandler } from "express"
import { prisma } from "../../database/prisma.js"
import { AppError } from "../../errors/AppError.js"
import {
	changePasswordSchema,
	loginUserSchema,
	registerUserSchema,
	resetPasswordSchema,
} from "../../validations/auth.schemas.js"
import { createSessionAndToken, publicUser } from "../../helpers/index.js"
import { request } from "http"
import { createHash, randomBytes } from "crypto"

export const register: RequestHandler = async (request, response) => {
	registerUserSchema.parse(request.body)

	const { username, email, password } = request.body

	const existing = await prisma.user.findUnique({
		where: { email },
	})

	if (existing) throw new AppError(409, "User already exists")

	const passwordHash = await bcrypt.hash(password, 12)

	const user = await prisma.user.create({
		data: { username, email, passwordHash },
	})

	const token = await createSessionAndToken(user.id)

	//email user

	return response
		.status(201)
		.json({ data: { user: publicUser(user), token } })
}

export const login: RequestHandler = async (request, response) => {
	const input = loginUserSchema.parse(request.body)
	const user = await prisma.user.findUnique({ where: { email: input.email } })

	if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
		throw new AppError(401, "Invalid email or password")
	}

	const token = await createSessionAndToken(user.id)

	return response.status(200).json({
		message: "Login successful",
		data: { user: publicUser(user), token },
	})
}

export const logout: RequestHandler = async (request, response) => {
	const sessionId = request.sessionId

	if (sessionId) {
		await prisma.session.update({
			where: { id: sessionId },
			data: { revokedAt: new Date() },
		})
	}

	return response.status(200).json({ message: "Logout successful" })
}

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
		where: { email: email },
	})

	if (!user) throw new AppError(404, "User not found")

	const token = randomBytes(32).toString("hex")
	const tokenHash = createHash("sha256").update(token).digest("hex")

	await prisma.passwordResetToken.create({
		data: {
			email: user.email,
			tokenHash,
			expiresAt: new Date(Date.now() + 60 * 60 * 1000),
		},
	})

	// send email to user
}

export const me: RequestHandler = async (request, response) => {
	const userId = request.userId
	if (!userId) throw new AppError(401, "Authentication required")
	const user = await prisma.user.findUnique({ where: { id: userId } })
	if (!user) throw new AppError(404, "User not found")
	const token = await createSessionAndToken(user.id)

	return response
		.status(200)
		.json({ data: { user: publicUser(user), token } })
}
