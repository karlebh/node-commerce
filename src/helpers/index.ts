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

type PublicUser = {
	id: string
	username: string
	email: string
	createdAt: Date
}

export const publicUser = (user: PublicUser): PublicUser => ({
	id: user.id,
	username: user.username,
	email: user.email,
	createdAt: user.createdAt,
})

export const createSessionAndToken = async (
	userId: string
): Promise<string> => {
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

export async function resolvePolymorphic(
	tx: Tx,
	type: string,
	id: string
): Promise<{ id: string } | null> {
	const resolver = polymorphicResolvers[type as PolymorphicType]
	if (!resolver) return null
	return resolver(tx, id)
}

export const isErrnoException = (err: unknown): err is NodeJS.ErrnoException =>
	err instanceof Error && "code" in err

import { IdempotencyStatus, type Prisma } from "@prisma/client"
import { createHash } from "node:crypto"
import type {
	InitializePaymentArgs,
	InitializePaymentResponse,
	WebhookHeaders,
} from "../types/payment.js"

export const generateReference = (): string =>
	`pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

type ReplayableKey = {
	status: typeof IdempotencyStatus.COMPLETED
	responseStatus: 201
	responseBody: Prisma.JsonObject & {
		authorizationUrl: string
		reference: string
		payment: Prisma.JsonObject
	}
}

export const isReplayablePaymentSuccess = (existing: {
	status: IdempotencyStatus
	responseStatus: number | null
	responseBody: Prisma.JsonValue | null
}): existing is ReplayableKey => {
	if (existing.status !== IdempotencyStatus.COMPLETED) return false
	if (existing.responseStatus !== 201) return false

	const body = existing.responseBody
	if (body === null || typeof body !== "object" || Array.isArray(body)) {
		return false
	}
	if (typeof body.authorizationUrl !== "string") return false
	if (typeof body.reference !== "string") return false

	const payment = body.payment
	if (
		payment === null ||
		typeof payment !== "object" ||
		Array.isArray(payment)
	) {
		return false
	}

	return true
}

export const headerValue = (
	headers: WebhookHeaders,
	key: string
): string | null => {
	const raw = headers[key] ?? headers[key.toLowerCase()]
	if (Array.isArray(raw)) return raw[0] ?? null
	return typeof raw === "string" ? raw : null
}

export const hashPaymentRequest = (args: InitializePaymentArgs): string =>
	createHash("sha256")
		.update(
			JSON.stringify({
				amount: args.amount,
				currency: args.currency ?? "NGN",
				provider: args.provider,
				orderId: args.orderId ?? null,
			})
		)
		.digest("hex")

export const serializeResponse = (
	response: InitializePaymentResponse
): Prisma.InputJsonValue => JSON.parse(JSON.stringify(response))

type StockFailureProduct = {
	isActive: boolean
	deletedAt: Date | null
} | null

export const getStockFailureReason = (product: StockFailureProduct): string => {
	if (!product) return "product_not_found"
	if (product.deletedAt) return "product_deleted"
	if (!product.isActive) return "product_inactive"
	return "insufficient_stock"
}
