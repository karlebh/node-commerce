import { describe, it, expect } from "vitest"
import type { Request } from "express"
import { paginate } from "../../src/lib/paginate.js"

const makeRequest = (
	overrides: Partial<Request> = {}
): Request => {
	const base: Partial<Request> = {
		protocol: "http",
		get: (() => "example.com") as unknown as Request["get"],
		baseUrl: "/api",
		path: "/items",
		query: {},
	}
	return { ...base, ...overrides } as Request
}

describe("paginate", () => {
	it("returns meta for an empty result set", () => {
		const result = paginate({
			request: makeRequest(),
			data: [],
			total: 0,
			page: 1,
			perPage: 10,
		})

		expect(result.total).toBe(0)
		expect(result.data).toEqual([])
		expect(result.current_page).toBe(1)
		expect(result.last_page).toBe(1)
		expect(result.from).toBeNull()
		expect(result.to).toBeNull()
		expect(result.next_page_url).toBeNull()
		expect(result.prev_page_url).toBeNull()
	})

	it("computes from/to and last_page for a middle page", () => {
		const result = paginate({
			request: makeRequest(),
			data: [1, 2, 3, 4, 5],
			total: 23,
			page: 2,
			perPage: 5,
		})

		expect(result.last_page).toBe(5)
		expect(result.from).toBe(6)
		expect(result.to).toBe(10)
		expect(result.current_page).toBe(2)
		expect(result.next_page_url).toContain("page=3")
		expect(result.prev_page_url).toContain("page=1")
	})

	it("builds URLs with the host and base path", () => {
		const result = paginate({
			request: makeRequest(),
			data: [],
			total: 0,
			page: 1,
			perPage: 10,
		})
		expect(result.first_page_url).toBe(
			"http://example.com/api/items?page=1"
		)
	})

	it("includes existing query params except page", () => {
		const req = makeRequest({
			query: { search: "foo", page: "9" } as unknown as Request["query"],
		})
		const result = paginate({
			request: req,
			data: [],
			total: 30,
			page: 1,
			perPage: 10,
		})
		expect(result.next_page_url).toContain("search=foo")
		expect(result.next_page_url).toContain("page=2")
		expect(result.next_page_url).not.toContain("page=9")
	})

	it("floors negative or zero pages to a safe minimum", () => {
		const result = paginate({
			request: makeRequest(),
			data: [],
			total: 100,
			page: 0,
			perPage: 10,
		})
		expect(result.current_page).toBe(1)
	})

	it("produces 'previous' and 'next' label links", () => {
		const result = paginate({
			request: makeRequest(),
			data: [],
			total: 50,
			page: 3,
			perPage: 10,
		})
		const labels = result.links.map((l) => l.label)
		expect(labels[0]).toBe("&laquo; Previous")
		expect(labels[labels.length - 1]).toBe("Next &raquo;")
	})
})
