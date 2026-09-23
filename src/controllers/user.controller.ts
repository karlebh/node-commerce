import bcrypt from "bcryptjs"
import { response, type RequestHandler } from "express"
import jwt from "jsonwebtoken"
import { env } from "../configs/env.js"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import {
	loginUserSchema,
	registerUserSchema,
} from "../validations/user.schemas.js"
import { createSessionAndToken, publicUser } from "../helpers/index.js"

export const register: RequestHandler = async (request, response) => {
	const input = registerUserSchema.parse(request.body)

	const existing = await prisma.user.findUnique({
		where: { email: input.email },
	})

	if (existing) throw new AppError(409, "Email is already registered")

	const user = await prisma.user.create({
		data: {
			...input,
			passwordHash: await bcrypt.hash(input.password, 12),
		},
	})

	const token = await createSessionAndToken(user.id)

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

	return response
		.status(200)
		.json({ data: { user: publicUser(user), token } })
}

export const logout: RequestHandler = async (request, response) => {
	const sessionId = request.sessionId

	if (sessionId) {
		await prisma.session.update({
			where: { id: sessionId },
			data: { revokedAt: new Date() },
		})
	}

	return response.status(204).send()
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
