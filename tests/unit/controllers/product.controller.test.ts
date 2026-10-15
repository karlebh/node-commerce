import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Request } from "express"
import {
	createControllerTestResponse,
	invokeController,
	type ControllerTestRequest,
} from "../../helpers/controller-test.js"

type ProductRecord = {
	id: string
	name: string
	slug?: string
	isActive?: boolean
	[key: string]: unknown
}

type PaginationInput = {
	data: ProductRecord[]
	total: number
	page: number
	perPage: number
	request: Request
}

type CreateProductBody = {
	name: string
	description: string
	price: number
	stock?: number
	imageUrl?: string
	categoryId: string
}

type UpdateProductBody = Partial<CreateProductBody>

const mockPrisma = {
	product: {
		findMany: vi.fn(),
		count: vi.fn(),
		findUnique: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
	},
}

vi.mock("../../../src/database/prisma.js", () => ({
	prisma: mockPrisma,
}))

vi.mock("../../../src/lib/paginate.js", () => ({
	paginate: ({ data, total, page, perPage, request }: PaginationInput) => ({
		current_page: page,
		data,
		first_page_url: `${request.protocol}://${request.get("host")}${request.baseUrl}${request.path}?page=1`,
		from: 1,
		last_page: Math.ceil(total / perPage),
		last_page_url: `${request.protocol}://${request.get("host")}${request.baseUrl}${request.path}?page=${Math.ceil(total / perPage)}`,
		links: [],
		next_page_url: null,
		path: `${request.protocol}://${request.get("host")}${request.baseUrl}${request.path}`,
		per_page: perPage,
		prev_page_url: null,
		to: data.length,
		total,
	}),
}))

const { index, show, store, update, destroy } =
	await import("../../../src/controllers/product.controller.js")

describe("Product Controller", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("lists active products with pagination and search", async () => {
		const products: ProductRecord[] = [
			{ id: "prod-1", name: "Air Max", isActive: true },
		]
		const request: ControllerTestRequest<Record<string, never>> = {
			body: {},
			query: { page: "1", perPage: "2", search: "air" },
			protocol: "http",
			get: vi.fn().mockReturnValue("example.com"),
			baseUrl: "",
			path: "/api/products",
		}
		const response = createControllerTestResponse()

		mockPrisma.product.findMany.mockResolvedValue(products)
		mockPrisma.product.count.mockResolvedValue(1)

		await invokeController(index, request, response)

		expect(mockPrisma.product.findMany).toHaveBeenCalledWith({
			where: { isActive: true, name: { contains: "air" } },
			skip: 0,
			take: 2,
			orderBy: { createdAt: "desc" },
		})
		expect(mockPrisma.product.count).toHaveBeenCalledWith({
			where: { isActive: true, name: { contains: "air" } },
		})
		expect(response.status).toHaveBeenCalledWith(200)
		expect(response.json).toHaveBeenCalledWith(
			expect.objectContaining({
				data: products,
				total: 1,
				current_page: 1,
				per_page: 2,
			})
		)
	})

	it("shows an active product by slug", async () => {
		const product: ProductRecord = {
			id: "prod-1",
			name: "Air Max",
			slug: "air-max",
			isActive: true,
		}
		const request: ControllerTestRequest<Record<string, never>> = {
			body: {},
			params: { slug: "air-max" },
		}
		const response = createControllerTestResponse()

		mockPrisma.product.findUnique.mockResolvedValue(product)

		await invokeController(show, request, response)

		expect(mockPrisma.product.findUnique).toHaveBeenCalledWith({
			where: { slug: "air-max" },
		})
		expect(response.json).toHaveBeenCalledWith({ data: product })
	})

	it("throws a not found error if the product is missing or inactive", async () => {
		const request: ControllerTestRequest<Record<string, never>> = {
			body: {},
			params: { slug: "missing-product" },
		}
		const response = createControllerTestResponse()

		mockPrisma.product.findUnique.mockResolvedValue(null)

		await expect(
			invokeController(show, request, response)
		).rejects.toThrow("Product not found")
	})

	it("creates a product for the authenticated user", async () => {
		const request: ControllerTestRequest<CreateProductBody> = {
			userId: "user-123",
			body: {
				name: "Air Max 270",
				description: "A lightweight everyday sneaker.",
				price: 1999,
				stock: 10,
				imageUrl: "https://example.com/image.png",
				categoryId: "cat-123",
			},
		}
		const response = createControllerTestResponse()
		const created = {
			id: "prod-1",
			...request.body,
			slug: "air-max-270-test",
		}

		mockPrisma.product.create.mockResolvedValue(created)

		await invokeController(store, request, response)

		expect(mockPrisma.product.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				name: "Air Max 270",
				slug: expect.stringMatching(
					/^air-max-270-[0-9a-f-]{36}$/
				),
				description: "A lightweight everyday sneaker.",
				price: 1999,
				stock: 10,
				imageUrl: "https://example.com/image.png",
				user: { connect: { id: "user-123" } },
				category: { connect: { id: "cat-123" } },
			}),
		})
		expect(response.status).toHaveBeenCalledWith(201)
		expect(response.json).toHaveBeenCalledWith({ data: created })
	})

	it("updates only the provided product fields", async () => {
		const request: ControllerTestRequest<UpdateProductBody> = {
			params: { slug: "air-max-270" },
			body: { name: "Updated Name", price: 2500 },
		}
		const response = createControllerTestResponse()
		const updated = { id: "prod-123", name: "Updated Name", price: 2500 }

		mockPrisma.product.update.mockResolvedValue(updated)

		await invokeController(update, request, response)

		expect(mockPrisma.product.update).toHaveBeenCalledWith({
			where: { slug: "air-max-270" },
			data: { name: "Updated Name", price: 2500 },
		})
		expect(response.status).toHaveBeenCalledWith(200)
		expect(response.json).toHaveBeenCalledWith({ data: updated })
	})

	it("soft deletes a product instead of removing it", async () => {
		const request: ControllerTestRequest<Record<string, never>> = {
			body: {},
			params: { id: "prod-123" },
		}
		const response = createControllerTestResponse()

		await invokeController(destroy, request, response)

		expect(mockPrisma.product.update).toHaveBeenCalledWith({
			where: { id: "prod-123" },
			data: { isActive: false },
		})
		expect(response.status).toHaveBeenCalledWith(204)
		expect(response.send).toHaveBeenCalledWith()
	})
})
