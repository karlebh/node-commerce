import { beforeEach, describe, expect, it, vi } from "vitest"
import request from "supertest"

const mockPrisma = {
	user: {},
	session: { findUnique: vi.fn() },
	product: {},
	category: {
		findMany: vi.fn(),
		count: vi.fn(),
		findUnique: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	},
	image: {},
	cart: {},
	cartItem: {},
	order: {},
	passwordResetToken: {},
	oAuthAccount: {},
	$transaction: vi.fn(),
}

vi.mock("../../src/database/prisma.js", () => ({ prisma: mockPrisma }))
vi.mock("../../src/jobs/emailQueue.js", () => ({
	addEmailJob: vi.fn(async () => ({ id: "job-1" })),
}))

const { app } = await import("../../src/app.js")
const VALID_UUID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"

const authFor = async (userId = "u1"): Promise<string> => {
	const { env } = await import("../../src/configs/env.js")
	const jwt = (await import("jsonwebtoken")).default
	const token = jwt.sign({}, env.JWT_SECRET, {
		subject: userId,
		jwtid: "s1",
		expiresIn: env.JWT_EXPIRES_IN,
	})
	mockPrisma.session.findUnique.mockResolvedValue({
		id: "s1",
		userId,
		revokedAt: null,
		expiresAt: new Date(Date.now() + 60_000),
	})
	return `Bearer ${token}`
}

describe("GET /api/categories", () => {
	beforeEach(() => vi.resetAllMocks())

	it("lists categories (public)", async () => {
		mockPrisma.category.findMany.mockResolvedValueOnce([
			{ id: "c1", name: "Shoes" },
		])
		mockPrisma.category.count.mockResolvedValueOnce(1)

		const res = await request(app).get("/api/categories")
		expect(res.status).toBe(200)
		expect(res.body.total).toBe(1)
		expect(res.body.data).toHaveLength(1)
	})
})

describe("GET /api/categories/:id", () => {
	beforeEach(() => vi.resetAllMocks())

	it("returns a category by id", async () => {
		mockPrisma.category.findUnique.mockResolvedValueOnce({
			id: VALID_UUID,
			name: "Shoes",
		})
		const res = await request(app).get(`/api/categories/${VALID_UUID}`)
		expect(res.status).toBe(200)
		expect(res.body.data.category.id).toBe(VALID_UUID)
	})

	it("422s when the path value is not a uuid", async () => {
		const res = await request(app).get("/api/categories/not-a-uuid")
		expect(res.status).toBe(422)
	})
})

describe("POST /api/categories (protected)", () => {
	beforeEach(() => vi.resetAllMocks())

	it("rejects unauthenticated callers with 401", async () => {
		const res = await request(app)
			.post("/api/categories")
			.send({ name: "Shoes" })
		expect(res.status).toBe(401)
	})

	it("creates a category when authenticated", async () => {
		const auth = await authFor()
		mockPrisma.category.findUnique.mockResolvedValueOnce(null)
		mockPrisma.category.create.mockImplementation(
			async ({
				data,
			}: {
				data: { name: string; slug: string }
			}) => ({ id: "c1", ...data })
		)

		const res = await request(app)
			.post("/api/categories")
			.set("Authorization", auth)
			.send({ name: "Shoes" })

		expect(res.status).toBe(201)
		expect(res.body.data.category.name).toBe("Shoes")
	})

	it("rejects a duplicate category with 409", async () => {
		const auth = await authFor()
		mockPrisma.category.findUnique.mockResolvedValueOnce({ id: "c1" })

		const res = await request(app)
			.post("/api/categories")
			.set("Authorization", auth)
			.send({ name: "Shoes" })

		expect(res.status).toBe(409)
	})
})
