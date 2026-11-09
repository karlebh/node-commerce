import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	createControllerTestResponse,
	invokeController,
	type ControllerTestRequest,
} from "../../helpers/controller-test.js"

const emptyByIndex = () => ({
	products: { index: "products" as const, total: 0, hits: [] },
	categories: { index: "categories" as const, total: 0, hits: [] },
	users: { index: "users" as const, total: 0, hits: [] },
	reviews: { index: "reviews" as const, total: 0, hits: [] },
})

const searchMock = vi.fn()

vi.mock("../../../src/services/search/search.service.js", () => ({
	searchService: { search: searchMock, driver: "postgres" },
	searchDriver: "postgres",
}))

const { index } = await import(
	"../../../src/controllers/search.controller.js"
)

describe("Search Controller", () => {
	beforeEach(() => {
		searchMock.mockReset()
	})

	it("passes the parsed query to the search service and returns the result", async () => {
		const result = {
			query: "shoes",
			driver: "postgres",
			page: 1,
			perPage: 10,
			total: 1,
			hits: [
				{
					index: "products",
					document: { id: "p1", name: "Nike Air" },
				},
			],
			byIndex: emptyByIndex(),
		}
		searchMock.mockResolvedValueOnce(result)

		const request: ControllerTestRequest<Record<string, never>> = {
			body: {},
			query: { q: "shoes" },
		}
		const response = createControllerTestResponse()

		await invokeController(index, request, response)

		expect(searchMock).toHaveBeenCalledWith({
			query: "shoes",
			page: 1,
			perPage: 10,
		})
		expect(response.status).toHaveBeenCalledWith(200)
		expect(response.json).toHaveBeenCalledWith({ data: result })
	})

	it("forwards indexes, page and perPage", async () => {
		searchMock.mockResolvedValueOnce({
			query: "x",
			driver: "postgres",
			page: 2,
			perPage: 5,
			total: 0,
			hits: [],
			byIndex: emptyByIndex(),
		})

		const request: ControllerTestRequest<Record<string, never>> = {
			body: {},
			query: {
				q: "x",
				page: "2",
				perPage: "5",
				indexes: "products,users",
			},
		}

		await invokeController(index, request, createControllerTestResponse())

		expect(searchMock).toHaveBeenCalledWith({
			query: "x",
			page: 2,
			perPage: 5,
			indexes: ["products", "users"],
		})
	})

	it("throws on an empty query", async () => {
		const request: ControllerTestRequest<Record<string, never>> = {
			body: {},
			query: { q: "" },
		}
		await expect(
			invokeController(index, request, createControllerTestResponse())
		).rejects.toThrow()
		expect(searchMock).not.toHaveBeenCalled()
	})

	it("throws on an unknown index", async () => {
		const request: ControllerTestRequest<Record<string, never>> = {
			body: {},
			query: { q: "shoes", indexes: "products,bogus" },
		}
		await expect(
			invokeController(index, request, createControllerTestResponse())
		).rejects.toThrow()
	})
})
