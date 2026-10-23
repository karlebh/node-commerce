import { beforeEach, describe, expect, it, vi } from "vitest"
import request from "supertest"

const mockPrisma = {
	user: {},
	session: { findUnique: vi.fn() },
	product: {
		findMany: vi.fn(),
		count: vi.fn(),
		findUnique: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	},
	category: {
		findUnique: vi.fn(),
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
const VALID_CUID2 = "clabcdefghij0123456789ab"

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

describe("GET /api/products", () => {
	beforeEach(() => vi.resetAllMocks())

	it("lists active products publicly", async () => {
		mockPrisma.product.findMany.mockResolvedValueOnce([
			{ id: "p1", name: "A", isActive: true },
		])
		mockPrisma.product.count.mockResolvedValueOnce(1)

		const res = await request(app).get("/api/products")
		expect(res.status).toBe(200)
		expect(res.body.total).toBe(1)
	})

	it("passes search filter down to Prisma", async () => {
		mockPrisma.product.findMany.mockResolvedValueOnce([])
		mockPrisma.product.count.mockResolvedValueOnce(0)

		await request(app).get("/api/products?search=air")
		expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { isActive: true, name: { contains: "air" } },
			})
		)
	})
})

describe("GET /api/products/:id", () => {
	beforeEach(() => vi.resetAllMocks())

	it("returns 422 for a clearly invalid cuid2", async () => {
		const res = await request(app).get("/api/products/NOT_A_CUID2!")
		expect(res.status).toBe(422)
	})

	it("returns a product by id", async () => {
		mockPrisma.product.findUnique.mockResolvedValueOnce({
			id: VALID_CUID2,
			isActive: true,
			review: [],
		})
		const res = await request(app).get(`/api/products/${VALID_CUID2}`)
		expect(res.status).toBe(200)
		expect(res.body.data.id).toBe(VALID_CUID2)
	})

	it("404s when inactive or missing", async () => {
		mockPrisma.product.findUnique.mockResolvedValueOnce(null)
		const res = await request(app).get(`/api/products/${VALID_CUID2}`)
		expect(res.status).toBe(404)
	})
})

describe("POST /api/products (protected)", () => {
	beforeEach(() => vi.resetAllMocks())

	it("requires auth", async () => {
		const res = await request(app).post("/api/products").send({
			name: "Widget",
			description: "A fine widget",
			price: 100,
			categoryId: "cat-1",
		})
		expect(res.status).toBe(401)
	})

	it("creates a product under the user's ownership", async () => {
		const auth = await authFor("user-1")
		mockPrisma.category.findUnique.mockResolvedValueOnce({ id: "cat-1" })
		mockPrisma.product.create.mockImplementation(
			async ({ data }: { data: Record<string, unknown> }) => ({
				id: "p1",
				...data,
			})
		)

		const res = await request(app)
			.post("/api/products")
			.set("Authorization", auth)
			.send({
				name: "Widget",
				description: "A fine widget indeed",
				price: 1000,
				stock: 5,
				categoryId: "cat-1",
			})

		expect(res.status).toBe(201)
		expect(mockPrisma.product.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				name: "Widget",
				user: { connect: { id: "user-1" } },
				category: { connect: { id: "cat-1" } },
			}),
		})
	})

	it("returns 404 when the category does not exist", async () => {
		const auth = await authFor()
		mockPrisma.category.findUnique.mockResolvedValueOnce(null)

		const res = await request(app)
			.post("/api/products")
			.set("Authorization", auth)
			.send({
				name: "Widget",
				description: "A fine widget indeed",
				price: 1000,
				stock: 5,
				categoryId: "cat-missing",
			})

		expect(res.status).toBe(404)
	})
})
