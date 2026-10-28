import { beforeEach, describe, expect, it, vi } from "vitest"
import request from "supertest"

const mockPrisma = {
	user: {
		findUnique: vi.fn(),
		findFirst: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
	},
	session: {
		findUnique: vi.fn(),
		findFirst: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
	},
	product: {},
	category: {},
	image: {},
	cart: {},
	cartItem: {},
	order: {},
	passwordResetToken: { findFirst: vi.fn() },
	oAuthAccount: {},
	$transaction: vi.fn(),
}

const mockBcrypt = {
	hash: vi.fn(),
	compare: vi.fn(),
}

vi.mock("../../src/database/prisma.js", () => ({ prisma: mockPrisma }))
vi.mock("bcryptjs", () => ({ default: mockBcrypt }))
vi.mock("../../src/jobs/emailQueue.js", () => ({
	addEmailJob: vi.fn(async () => ({ id: "job-1" })),
}))

const { app } = await import("../../src/app.js")

describe("POST /api/auth/register", () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	it("creates a new user and returns a token", async () => {
		mockPrisma.user.findFirst.mockResolvedValueOnce(null)
		mockBcrypt.hash.mockResolvedValueOnce("hashed")
		mockPrisma.user.create.mockResolvedValueOnce({
			id: "u1",
			username: "jane",
			email: "jane@example.com",
			createdAt: new Date(),
		})
		mockPrisma.session.create.mockResolvedValueOnce({ id: "s1" })

		const res = await request(app).post("/api/auth/register").send({
			username: "jane",
			email: "jane@example.com",
			password: "longenough",
		})

		expect(res.status).toBe(201)
		expect(res.body.data.user.email).toBe("jane@example.com")
		expect(typeof res.body.data.token).toBe("string")
		expect(mockPrisma.user.create).toHaveBeenCalled()
	})

	it("returns 422 when the email is already taken", async () => {
		mockPrisma.user.findFirst.mockResolvedValueOnce({
			email: "jane@example.com",
			username: "someone-else",
		})

		const res = await request(app).post("/api/auth/register").send({
			username: "jane",
			email: "jane@example.com",
			password: "longenough",
		})

		expect(res.status).toBe(422)
		expect(res.body.errors).toContainEqual({
			field: "email",
			message: "User already exists",
		})
	})

	it("returns 422 when the username is already taken", async () => {
		mockPrisma.user.findFirst.mockResolvedValueOnce({
			email: "someone@example.com",
			username: "jane",
		})

		const res = await request(app).post("/api/auth/register").send({
			username: "jane",
			email: "new@example.com",
			password: "longenough",
		})

		expect(res.status).toBe(422)
		expect(res.body.errors).toContainEqual({
			field: "username",
			message: "Username is taken",
		})
	})

	it("returns 422 for invalid payload", async () => {
		const res = await request(app).post("/api/auth/register").send({
			username: "x",
			email: "not-an-email",
			password: "short",
		})

		expect(res.status).toBe(422)
		expect(res.body.message).toBe("Validation failed")
		expect(res.body.errors.length).toBeGreaterThan(0)
	})
})

describe("POST /api/auth/login", () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	it("returns a token on success", async () => {
		mockPrisma.user.findUnique.mockResolvedValueOnce({
			id: "u1",
			username: "jane",
			email: "jane@example.com",
			passwordHash: "hashed",
			createdAt: new Date(),
		})
		mockBcrypt.compare.mockResolvedValueOnce(true)
		mockPrisma.session.create.mockResolvedValueOnce({ id: "s1" })

		const res = await request(app).post("/api/auth/login").send({
			email: "jane@example.com",
			password: "longenough",
		})

		expect(res.status).toBe(200)
		expect(res.body.data.user.email).toBe("jane@example.com")
		expect(typeof res.body.data.token).toBe("string")
	})

	it("returns 401 on wrong password", async () => {
		mockPrisma.user.findUnique.mockResolvedValueOnce({
			id: "u1",
			email: "jane@example.com",
			passwordHash: "hashed",
		})
		mockBcrypt.compare.mockResolvedValueOnce(false)

		const res = await request(app).post("/api/auth/login").send({
			email: "jane@example.com",
			password: "longenough",
		})

		expect(res.status).toBe(401)
	})

	it("returns 401 for an unknown email", async () => {
		mockPrisma.user.findUnique.mockResolvedValueOnce(null)

		const res = await request(app).post("/api/auth/login").send({
			email: "ghost@example.com",
			password: "longenough",
		})

		expect(res.status).toBe(401)
	})
})

describe("GET /api/auth/me (protected)", () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	it("returns 401 without a token", async () => {
		const res = await request(app).get("/api/auth/me")
		expect(res.status).toBe(401)
	})

	it("returns the user when the session is valid", async () => {
		const { env } = await import("../../src/configs/env.js")
		const jwt = (await import("jsonwebtoken")).default
		const token = jwt.sign({}, env.JWT_SECRET, {
			subject: "u1",
			jwtid: "s1",
			expiresIn: env.JWT_EXPIRES_IN,
		})
		mockPrisma.session.findUnique.mockResolvedValueOnce({
			id: "s1",
			userId: "u1",
			revokedAt: null,
			expiresAt: new Date(Date.now() + 60_000),
		})
		mockPrisma.user.findUnique.mockResolvedValueOnce({
			id: "u1",
			username: "jane",
			email: "jane@example.com",
			createdAt: new Date(),
		})
		mockPrisma.session.create.mockResolvedValueOnce({ id: "s2" })

		const res = await request(app)
			.get("/api/auth/me")
			.set("Authorization", `Bearer ${token}`)

		expect(res.status).toBe(200)
		expect(res.body.data.user.id).toBe("u1")
	})
})

describe("POST /api/auth/logout (protected)", () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	it("revokes the session when authenticated", async () => {
		const { env } = await import("../../src/configs/env.js")
		const jwt = (await import("jsonwebtoken")).default
		const token = jwt.sign({}, env.JWT_SECRET, {
			subject: "u1",
			jwtid: "s1",
			expiresIn: env.JWT_EXPIRES_IN,
		})
		mockPrisma.session.findUnique.mockResolvedValueOnce({
			id: "s1",
			userId: "u1",
			revokedAt: null,
			expiresAt: new Date(Date.now() + 60_000),
		})
		mockPrisma.session.update.mockResolvedValueOnce({ id: "s1" })

		const res = await request(app)
			.post("/api/auth/logout")
			.set("Authorization", `Bearer ${token}`)

		expect(res.status).toBe(200)
		expect(mockPrisma.session.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: "s1" },
				data: { revokedAt: expect.any(Date) },
			})
		)
	})
})

describe("GET /api/auth/google (OAuth start)", () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	it("redirects to Google's OAuth consent screen with a signed state", async () => {
		const res = await request(app).get("/api/auth/google")
		expect(res.status).toBe(302)
		const location = res.headers.location ?? ""
		expect(location).toContain("accounts.google.com/o/oauth2/v2/auth")

		const stateParam = new URL(location).searchParams.get("state") ?? ""
		expect(stateParam.split(".").length).toBe(3)

		const jwt = (await import("jsonwebtoken")).default
		const { env } = await import("../../src/configs/env.js")
		const decoded = jwt.verify(stateParam, env.JWT_SECRET) as {
			purpose: string
			provider: string
		}
		expect(decoded.purpose).toBe("oauth-state")
		expect(decoded.provider).toBe("GOOGLE")
	})
})

describe("GET /api/auth/github (OAuth start)", () => {
	beforeEach(() => {
		vi.resetAllMocks()
	})

	it("redirects to GitHub's OAuth consent screen with a signed state", async () => {
		const res = await request(app).get("/api/auth/github")
		expect(res.status).toBe(302)
		const location = res.headers.location ?? ""
		expect(location).toContain("github.com/login/oauth/authorize")

		const stateParam = new URL(location).searchParams.get("state") ?? ""
		expect(stateParam.split(".").length).toBe(3)

		const jwt = (await import("jsonwebtoken")).default
		const { env } = await import("../../src/configs/env.js")
		const decoded = jwt.verify(stateParam, env.JWT_SECRET) as {
			purpose: string
			provider: string
		}
		expect(decoded.purpose).toBe("oauth-state")
		expect(decoded.provider).toBe("GITHUB")
	})
})
