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

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

const polymorphicResolvers = {
	User: (tx: Tx, id: string) =>
		tx.user.findUnique({ where: { id }, omit: { passwordHash: true } }),
	Category: (tx: Tx, id: string) => tx.category.findUnique({ where: { id } }),
	Product: (tx: Tx, id: string) => tx.product.findUnique({ where: { id } }),
} as const

export type PolymorphicType = keyof typeof polymorphicResolvers

export async function resolvePolymorphic(tx: Tx, type: string, id: string) {
	const resolver = polymorphicResolvers[type as PolymorphicType]
	if (!resolver) return null
	return resolver(tx, id)
}

export const isErrnoException = (err: unknown): err is NodeJS.ErrnoException =>
	err instanceof Error && "code" in err
