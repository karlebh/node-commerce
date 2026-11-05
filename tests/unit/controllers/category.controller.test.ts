import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	createControllerTestResponse,
	invokeController,
	type ControllerTestRequest,
} from "../../helpers/controller-test.js"

const mockPrisma = {
	category: {
		findMany: vi.fn(),
		count: vi.fn(),
		findUnique: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	},
}

vi.mock("../../../src/database/prisma.js", () => ({
	prisma: mockPrisma,
}))

vi.mock("../../../src/lib/paginate.js", () => ({
	paginate: ({
		data,
		total,
		page,
		perPage,
	}: {
		data: unknown[]
		total: number
		page: number
		perPage: number
	}) => ({
		data,
		total,
		current_page: page,
		per_page: perPage,
	}),
}))

const { index, show, store, update, destroy } = await import(
	"../../../src/controllers/category.controller.js"
)

const VALID_UUID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"

describe("Category Controller", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("index", () => {
		it("returns paginated categories", async () => {
			const categories = [{ id: "c1", name: "Shoes" }]
			mockPrisma.category.findMany.mockResolvedValue(categories)
			mockPrisma.category.count.mockResolvedValue(1)

			const request: ControllerTestRequest<Record<string, never>> = {
				body: {},
				query: { page: "1", perPage: "10" },
				protocol: "http",
				get: vi.fn().mockReturnValue("example.com"),
				baseUrl: "",
				path: "/api/categories",
			}
			const response = createControllerTestResponse()

			await invokeController(index, request, response)

			expect(response.status).toHaveBeenCalledWith(200)
			expect(response.json).toHaveBeenCalledWith(
				expect.objectContaining({ data: categories, total: 1 })
			)
		})
	})

	describe("show", () => {
		it("returns a category by id", async () => {
			const category = { id: VALID_UUID, name: "Shoes" }
			mockPrisma.category.findUnique.mockResolvedValue(category)

			const request: ControllerTestRequest<Record<string, never>> = {
				body: {},
				params: { id: VALID_UUID },
			}
			const response = createControllerTestResponse()

			await invokeController(show, request, response)

			expect(mockPrisma.category.findUnique).toHaveBeenCalledWith({
				where: { id: VALID_UUID },
			})
			expect(response.status).toHaveBeenCalledWith(200)
			expect(response.json).toHaveBeenCalledWith({
				data: { category },
			})
		})

		it("throws 404 when not found", async () => {
			mockPrisma.category.findUnique.mockResolvedValue(null)

			const request: ControllerTestRequest<Record<string, never>> = {
				body: {},
				params: { id: VALID_UUID },
			}

			await expect(
				invokeController(
					show,
					request,
					createControllerTestResponse()
				)
			).rejects.toThrow("Not found")
		})
	})

	describe("store", () => {
		it("creates a new category with a slug", async () => {
			mockPrisma.category.findUnique.mockResolvedValue(null)
			mockPrisma.category.create.mockImplementation(
				async ({ data }: { data: { name: string; slug: string } }) => ({
					id: "cat-1",
					...data,
				})
			)

			const request: ControllerTestRequest<{ name: string }> = {
				body: { name: "Running Shoes" },
			}
			const response = createControllerTestResponse()

			await invokeController(store, request, response)

			expect(mockPrisma.category.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					name: "Running Shoes",
					slug: expect.stringMatching(
						/^running-shoes-[0-9a-f-]{36}$/
					),
				}),
			})
			expect(response.status).toHaveBeenCalledWith(201)
		})

		it("throws 409 if the category already exists", async () => {
			mockPrisma.category.findUnique.mockResolvedValue({ id: "cat-1" })

			await expect(
				invokeController(
					store,
					{ body: { name: "Running Shoes" } },
					createControllerTestResponse()
				)
			).rejects.toThrow("Category already exist")
		})
	})

	describe("destroy", () => {
		it("deletes a category and returns 204", async () => {
			mockPrisma.category.findUnique.mockResolvedValue({
				id: VALID_UUID,
			})
			mockPrisma.category.delete.mockResolvedValue({})

			const request: ControllerTestRequest<Record<string, never>> = {
				body: {},
				params: { id: VALID_UUID },
			}
			const response = createControllerTestResponse()

			await invokeController(destroy, request, response)

			expect(mockPrisma.category.delete).toHaveBeenCalledWith({
				where: { id: VALID_UUID },
			})
			expect(response.status).toHaveBeenCalledWith(204)
		})

		it("throws 404 when the category is missing", async () => {
			mockPrisma.category.findUnique.mockResolvedValue(null)

			await expect(
				invokeController(
					destroy,
					{ body: {}, params: { id: VALID_UUID } },
					createControllerTestResponse()
				)
			).rejects.toThrow("Not found")
		})
	})

	describe("update", () => {
		it("updates the category name", async () => {
			const updated = { id: VALID_UUID, name: "New Name" }
			mockPrisma.category.update.mockResolvedValue(updated)

			const request: ControllerTestRequest<{ name: string }> = {
				params: { id: VALID_UUID },
				body: { name: "New Name" },
			}
			const response = createControllerTestResponse()

			await invokeController(update, request, response)

			expect(mockPrisma.category.update).toHaveBeenCalledWith({
				where: { id: VALID_UUID },
				data: { name: "New Name" },
			})
			expect(response.status).toHaveBeenCalledWith(200)
		})
	})
})
