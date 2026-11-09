import { describe, expect, it } from "vitest"
import { NullSearchProvider } from "../../../../src/services/search/providers/null.provider.js"

describe("NullSearchProvider", () => {
	it("returns empty search results regardless of query", async () => {
		const provider = new NullSearchProvider()
		const result = await provider.search({ query: "anything", page: 2, perPage: 5 })
		expect(result).toMatchObject({
			driver: "null",
			page: 2,
			perPage: 5,
			total: 0,
			hits: [],
		})
		for (const name of Object.keys(result.byIndex)) {
			expect(result.byIndex[name as keyof typeof result.byIndex].total).toBe(0)
		}
	})

	it("index/remove/clear/init are no-ops", async () => {
		const provider = new NullSearchProvider()
		await expect(provider.init()).resolves.toBeUndefined()
		await expect(
			provider.index("products", [{ id: "x" }])
		).resolves.toBeUndefined()
		await expect(provider.remove("products", ["x"])).resolves.toBeUndefined()
		await expect(provider.clear("products")).resolves.toBeUndefined()
	})
})
