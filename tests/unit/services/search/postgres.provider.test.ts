import { beforeEach, describe, expect, it, vi } from "vitest"

const mockPrisma = {
	product: { findMany: vi.fn(), count: vi.fn() },
	category: { findMany: vi.fn(), count: vi.fn() },
	user: { findMany: vi.fn(), count: vi.fn() },
	review: { findMany: vi.fn(), count: vi.fn() },
}

vi.mock("../../../../src/database/prisma.js", () => ({
	prisma: mockPrisma,
}))

const { PostgresSearchProvider } = await import(
	"../../../../src/services/search/providers/postgres.provider.js"
)

const insensitive = { mode: "insensitive" }

describe("PostgresSearchProvider", () => {
	beforeEach(() => {
		for (const model of Object.values(mockPrisma)) {
			model.findMany.mockReset()
			model.count.mockReset()
		}
	})

	it("reports its driver name", () => {
		expect(new PostgresSearchProvider().name).toBe("postgres")
	})

	it("returns an empty result when the query is blank", async () => {
		const provider = new PostgresSearchProvider()
		const result = await provider.search({ query: "   " })
		expect(result.total).toBe(0)
		expect(result.hits).toEqual([])
		expect(result.driver).toBe("postgres")
		for (const model of Object.values(mockPrisma)) {
			expect(model.findMany).not.toHaveBeenCalled()
		}
	})

	it("searches all indexes with ILIKE and aggregates totals", async () => {
		mockPrisma.product.findMany.mockResolvedValueOnce([
			{ id: "p1", name: "Air", slug: "air", description: "shoe" },
		])
		mockPrisma.product.count.mockResolvedValueOnce(1)

		mockPrisma.category.findMany.mockResolvedValueOnce([
			{ id: "c1", name: "Air", slug: "air" },
		])
		mockPrisma.category.count.mockResolvedValueOnce(1)

		mockPrisma.user.findMany.mockResolvedValueOnce([])
		mockPrisma.user.count.mockResolvedValueOnce(0)

		mockPrisma.review.findMany.mockResolvedValueOnce([
			{ id: "r1", title: "Air" },
		])
		mockPrisma.review.count.mockResolvedValueOnce(1)

		const provider = new PostgresSearchProvider()
		const result = await provider.search({
			query: "Air",
			page: 1,
			perPage: 5,
		})

		expect(result.total).toBe(3)
		expect(result.byIndex.products.total).toBe(1)
		expect(result.byIndex.categories.total).toBe(1)
		expect(result.byIndex.users.total).toBe(0)
		expect(result.byIndex.reviews.total).toBe(1)
		expect(result.hits).toHaveLength(3)

		expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				skip: 0,
				take: 5,
				where: expect.objectContaining({
					isActive: true,
					deletedAt: null,
					OR: [
						{ name: { contains: "Air", ...insensitive } },
						{ description: { contains: "Air", ...insensitive } },
						{ slug: { contains: "Air", ...insensitive } },
					],
				}),
			})
		)
	})

	it("limits search to the requested indexes", async () => {
		mockPrisma.product.findMany.mockResolvedValueOnce([])
		mockPrisma.product.count.mockResolvedValueOnce(0)

		const provider = new PostgresSearchProvider()
		await provider.search({ query: "foo", indexes: ["products"] })

		expect(mockPrisma.product.findMany).toHaveBeenCalledOnce()
		expect(mockPrisma.category.findMany).not.toHaveBeenCalled()
		expect(mockPrisma.user.findMany).not.toHaveBeenCalled()
		expect(mockPrisma.review.findMany).not.toHaveBeenCalled()
	})

	it("paginates with (page-1)*perPage", async () => {
		mockPrisma.product.findMany.mockResolvedValueOnce([])
		mockPrisma.product.count.mockResolvedValueOnce(0)

		const provider = new PostgresSearchProvider()
		await provider.search({
			query: "foo",
			indexes: ["products"],
			page: 3,
			perPage: 7,
		})

		expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
			expect.objectContaining({ skip: 14, take: 7 })
		)
	})

	it("index/remove/clear are no-ops", async () => {
		const provider = new PostgresSearchProvider()
		await expect(
			provider.index("products", [{ id: "x" }])
		).resolves.toBeUndefined()
		await expect(provider.remove("products", ["x"])).resolves.toBeUndefined()
		await expect(provider.clear("products")).resolves.toBeUndefined()
	})
})
