import { beforeEach, describe, expect, it, vi } from "vitest"
import request from "supertest"

const searchMock = vi.fn()

vi.mock("../../src/services/search/search.service.js", () => ({
	searchService: { search: searchMock, driver: "postgres" },
	searchDriver: "postgres",
}))

const mockPrisma = {
	user: {},
	session: {},
	product: {},
	category: {},
	cart: {},
	cartItem: {},
	order: {},
	image: {},
	oAuthAccount: {},
	passwordResetToken: {},
	$transaction: vi.fn(),
}

vi.mock("../../src/database/prisma.js", () => ({ prisma: mockPrisma }))

const { app } = await import("../../src/app.js")

const emptyByIndex = () => ({
	products: { index: "products" as const, total: 0, hits: [] },
	categories: { index: "categories" as const, total: 0, hits: [] },
	users: { index: "users" as const, total: 0, hits: [] },
	reviews: { index: "reviews" as const, total: 0, hits: [] },
})

describe("GET /api/search", () => {
	beforeEach(() => {
		searchMock.mockReset()
	})

	it("returns 200 with search results for a valid query", async () => {
		searchMock.mockResolvedValueOnce({
			query: "shoes",
			driver: "postgres",
			page: 1,
			perPage: 10,
			total: 1,
			hits: [
				{ index: "products", document: { id: "p1", name: "Shoe" } },
			],
			byIndex: emptyByIndex(),
		})

		const response = await request(app).get("/api/search?q=shoes")

		expect(response.status).toBe(200)
		expect(response.body.data.total).toBe(1)
		expect(response.body.data.hits[0].document.id).toBe("p1")
		expect(searchMock).toHaveBeenCalledWith({
			query: "shoes",
			page: 1,
			perPage: 10,
		})
	})

	it("passes pagination and index filters through to the service", async () => {
		searchMock.mockResolvedValueOnce({
			query: "a",
			driver: "postgres",
			page: 2,
			perPage: 3,
			total: 0,
			hits: [],
			byIndex: emptyByIndex(),
		})

		await request(app).get(
			"/api/search?q=a&page=2&perPage=3&indexes=products,users"
		)

		expect(searchMock).toHaveBeenCalledWith({
			query: "a",
			page: 2,
			perPage: 3,
			indexes: ["products", "users"],
		})
	})

	it("rejects a missing q with a validation error", async () => {
		const response = await request(app).get("/api/search")
		expect(response.status).toBe(422)
		expect(searchMock).not.toHaveBeenCalled()
	})

	it("rejects perPage above 50", async () => {
		const response = await request(app).get(
			"/api/search?q=shoes&perPage=100"
		)
		expect(response.status).toBe(422)
	})

	it("rejects an unknown index", async () => {
		const response = await request(app).get(
			"/api/search?q=shoes&indexes=bogus"
		)
		expect(response.status).toBe(422)
	})
})
