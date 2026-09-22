import bcrypt from "bcryptjs"
import type { RequestHandler } from "express"
import jwt from "jsonwebtoken"
import { env } from "../configs/env.js"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import { loginUserSchema, registerUserSchema } from "../models/user.schemas.js"

const publicUser = (user: {
	id: string
	name: string
	email: string
	createdAt: Date
}) => ({
	id: user.id,
	name: user.name,
	email: user.email,
	createdAt: user.createdAt,
})

export const register: RequestHandler = async (request, response) => {
	const input = registerUserSchema.parse(request.body)
	const existing = await prisma.user.findUnique({
		where: { email: input.email },
	})

	if (existing) throw new AppError(409, "Email is already registered")

	const user = await prisma.user.create({
		data: { ...input, passwordHash: await bcrypt.hash(input.password, 12) },
	})
	const token = jwt.sign({}, env.JWT_SECRET, {
		subject: user.id,
		expiresIn: "7d",
	})
	response.status(201).json({ user: publicUser(user), token })
}

export const login: RequestHandler = async (request, response) => {
	const input = loginUserSchema.parse(request.body)
	const user = await prisma.user.findUnique({ where: { email: input.email } })

	if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
		throw new AppError(401, "Invalid email or password")
	}

	const token = jwt.sign({}, env.JWT_SECRET, {
		subject: user.id,
		expiresIn: "7d",
	})
	response.json({ user: publicUser(user), token })
}

export const me: RequestHandler = async (request, response) => {
	const userId = request.userId
	if (!userId) throw new AppError(401, "Authentication required")
	const user = await prisma.user.findUnique({ where: { id: userId } })
	if (!user) throw new AppError(404, "User not found")

	response.json({ user: publicUser(user) })
}
