import bcrypt from "bcryptjs"
import { type Request, type RequestHandler, type Response } from "express"
import { prisma } from "../../database/prisma.js"
import { AppError } from "../../errors/AppError.js"
import {
	loginUserSchema,
	registerUserSchema,
} from "../../validations/auth.schemas.js"
import { createSessionAndToken, publicUser } from "../../helpers/index.js"
import { addEmailJob } from "../../jobs/emailQueue.js"
import type {
	AuthenticatedHandler,
	AuthenticatedRequest,
} from "../../middleware/protectedHandler.js"

export const register: RequestHandler = async (
	request: Request,
	response: Response
) => {
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

	await addEmailJob("register", { email: user.email, name: user.username })

	return response
		.status(201)
		.json({ data: { user: publicUser(user), token } })
}

export const login: RequestHandler = async (
	request: Request,
	response: Response
) => {
	const input = loginUserSchema.parse(request.body)
	const user = await prisma.user.findUnique({
		where: { email: input.email },
		omit: { passwordHash: false },
	})

	if (
		!user ||
		!user.passwordHash ||
		!(await bcrypt.compare(input.password, user.passwordHash))
	) {
		throw new AppError(401, "Invalid email or password")
	}

	const token = await createSessionAndToken(user.id)

	return response.status(200).json({
		message: "Login successful",
		data: { user: publicUser(user), token },
	})
}

export const logout: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
) => {
	const sessionId = request.sessionId

	await prisma.session.update({
		where: { id: sessionId },
		data: { revokedAt: new Date() },
	})

	return response.status(200).json({ message: "Logout successful" })
}

export const me: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
) => {
	const userId = request.userId
	const user = await prisma.user.findUnique({ where: { id: userId } })
	if (!user) throw new AppError(404, "User not found")
	const token = await createSessionAndToken(user.id)

	return response
		.status(200)
		.json({ data: { user: publicUser(user), token } })
}
