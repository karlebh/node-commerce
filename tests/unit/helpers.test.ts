import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../src/database/prisma.js", async () => {
	const { createPrismaMock } = await import("../helpers/prisma-mock.js")
	return { prisma: createPrismaMock() }
})

import { prisma } from "../../src/database/prisma.js"
import type { PrismaMock } from "../helpers/prisma-mock.js"
import {
	createSlug,
	publicUser,
	createSessionAndToken,
	resolvePolymorphic,
	isErrnoException,
} from "../../src/helpers/index.js"

const prismaMock = prisma as unknown as PrismaMock

describe("createSlug", () => {
	it("lowercases, trims, replaces spaces, appends a UUID", () => {
		const slug = createSlug("  Hello World  ")
		expect(slug.startsWith("hello-world-")).toBe(true)
		expect(slug).toMatch(/^hello-world-[0-9a-f-]{36}$/)
	})

	it("strips non-word characters", () => {
		const slug = createSlug("Fancy!@# Pants$%^")
		expect(slug).toMatch(/^fancy-pants-[0-9a-f-]{36}$/)
	})

	it("produces different suffixes each call", () => {
		const a = createSlug("same")
		const b = createSlug("same")
		expect(a).not.toBe(b)
	})
})

describe("publicUser", () => {
	it("picks only the public fields", () => {
		const created = new Date("2024-01-01T00:00:00Z")
		const result = publicUser({
			id: "u1",
			username: "jane",
			email: "jane@example.com",
			createdAt: created,
		})

		expect(result).toEqual({
			id: "u1",
			username: "jane",
			email: "jane@example.com",
			createdAt: created,
		})
		expect(Object.keys(result)).toEqual([
			"id",
			"username",
			"email",
			"createdAt",
		])
	})
})

describe("createSessionAndToken", () => {
	beforeEach(() => {
		prismaMock.session.create.mockReset()
	})

	it("creates a session and signs a JWT with sub + jti", async () => {
		prismaMock.session.create.mockResolvedValueOnce({ id: "sess-1" })

		const token = await createSessionAndToken("user-1")

		expect(prismaMock.session.create).toHaveBeenCalledTimes(1)
		const callArg = prismaMock.session.create.mock.calls[0]?.[0] as {
			data: { userId: string; expiresAt: Date }
		}
		expect(callArg.data.userId).toBe("user-1")
		expect(callArg.data.expiresAt).toBeInstanceOf(Date)
		expect(callArg.data.expiresAt.getTime()).toBeGreaterThan(Date.now())

		const [, payloadB64] = token.split(".")
		const payload = JSON.parse(
			Buffer.from(payloadB64!, "base64url").toString()
		)
		expect(payload.sub).toBe("user-1")
		expect(payload.jti).toBe("sess-1")
	})
})

describe("resolvePolymorphic", () => {
	beforeEach(() => {
		prismaMock.user.findUnique.mockReset()
		prismaMock.product.findUnique.mockReset()
		prismaMock.category.findUnique.mockReset()
	})

	it("returns null for unknown type", async () => {
		const result = await resolvePolymorphic(
			prismaMock as unknown as Parameters<typeof resolvePolymorphic>[0],
			"UNKNOWN",
			"x"
		)
		expect(result).toBeNull()
	})

	it("resolves a User", async () => {
		prismaMock.user.findUnique.mockResolvedValueOnce({ id: "u1" })
		const result = await resolvePolymorphic(
			prismaMock as unknown as Parameters<typeof resolvePolymorphic>[0],
			"User",
			"u1"
		)
		expect(result).toEqual({ id: "u1" })
		expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
			where: { id: "u1" },
			omit: { passwordHash: true },
		})
	})

	it("resolves a Product", async () => {
		prismaMock.product.findUnique.mockResolvedValueOnce({ id: "p1" })
		const result = await resolvePolymorphic(
			prismaMock as unknown as Parameters<typeof resolvePolymorphic>[0],
			"Product",
			"p1"
		)
		expect(result).toEqual({ id: "p1" })
	})

	it("resolves a Category", async () => {
		prismaMock.category.findUnique.mockResolvedValueOnce({ id: "c1" })
		const result = await resolvePolymorphic(
			prismaMock as unknown as Parameters<typeof resolvePolymorphic>[0],
			"Category",
			"c1"
		)
		expect(result).toEqual({ id: "c1" })
	})
})

describe("isErrnoException", () => {
	it("returns true for Error with code property", () => {
		const err = Object.assign(new Error("boom"), { code: "ENOENT" })
		expect(isErrnoException(err)).toBe(true)
	})

	it("returns false for plain Error", () => {
		expect(isErrnoException(new Error("boom"))).toBe(false)
	})

	it("returns false for non-Error values", () => {
		expect(isErrnoException(null)).toBe(false)
		expect(isErrnoException("ENOENT")).toBe(false)
		expect(isErrnoException({ code: "ENOENT" })).toBe(false)
	})
})
