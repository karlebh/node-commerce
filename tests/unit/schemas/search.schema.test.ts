import { describe, expect, it } from "vitest"
import { searchQuerySchema } from "../../../src/validations/search.schema.js"

describe("searchQuerySchema", () => {
	it("parses a minimal query with defaults", () => {
		const parsed = searchQuerySchema.parse({ q: "shoes" })
		expect(parsed).toEqual({
			q: "shoes",
			page: 1,
			perPage: 10,
			indexes: undefined,
		})
	})

	it("trims whitespace around q", () => {
		const parsed = searchQuerySchema.parse({ q: "  shoes  " })
		expect(parsed.q).toBe("shoes")
	})

	it("coerces page and perPage to integers", () => {
		const parsed = searchQuerySchema.parse({
			q: "x",
			page: "3",
			perPage: "25",
		})
		expect(parsed.page).toBe(3)
		expect(parsed.perPage).toBe(25)
	})

	it("rejects an empty q", () => {
		expect(() => searchQuerySchema.parse({ q: "" })).toThrow()
		expect(() => searchQuerySchema.parse({ q: "   " })).toThrow()
	})

	it("rejects q longer than 200 chars", () => {
		expect(() => searchQuerySchema.parse({ q: "a".repeat(201) })).toThrow()
	})

	it("rejects perPage above 50", () => {
		expect(() =>
			searchQuerySchema.parse({ q: "x", perPage: 100 })
		).toThrow()
	})

	it("rejects page below 1", () => {
		expect(() => searchQuerySchema.parse({ q: "x", page: 0 })).toThrow()
	})

	it("parses comma-separated indexes", () => {
		const parsed = searchQuerySchema.parse({
			q: "x",
			indexes: "products,users",
		})
		expect(parsed.indexes).toEqual(["products", "users"])
	})

	it("parses an array of indexes", () => {
		const parsed = searchQuerySchema.parse({
			q: "x",
			indexes: ["products", "reviews"],
		})
		expect(parsed.indexes).toEqual(["products", "reviews"])
	})

	it("rejects unknown indexes", () => {
		expect(() =>
			searchQuerySchema.parse({ q: "x", indexes: "products,bogus" })
		).toThrow()
	})
})
