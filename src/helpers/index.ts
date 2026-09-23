import { env } from "../configs/env.js"
import { prisma } from "../database/prisma.js"
import jwt from "jsonwebtoken"

export const createSlug = (name: string): string => {
	return `${name
		.toLowerCase()
		.trim()
		.replace(/\s+/g, "-")
		.replace(/[^\w-]/g, "")}-${crypto.randomUUID()}`
}

export const publicUser = (user: {
	id: string
	username: string
	email: string
	createdAt: Date
}) => ({
	id: user.id,
	username: user.username,
	email: user.email,
	createdAt: user.createdAt,
})

export const createSessionAndToken = async (userId: string) => {
	const expiresAt = new Date(Date.now() + env.SESSION_TTL_MS)
	const session = await prisma.session.create({ data: { userId, expiresAt } })
	const token = jwt.sign({}, env.JWT_SECRET, {
		subject: userId,
		jwtid: session.id,
		expiresIn: env.JWT_EXPIRES_IN,
	})
	return token
}
