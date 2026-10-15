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
		delete: vi.fn(),
	},
	category: {
		findUnique: vi.fn(),
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
		mockPrisma.category.findUnique.mockResolvedValue({ id: "category-123" })
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

	it("shows an active product by ID", async () => {
		const product: ProductRecord = {
			id: "abcdefgh12345678abcdefgh",
			name: "Air Max",
			isActive: true,
		}
		const request: ControllerTestRequest<Record<string, never>> = {
			body: {},
			params: { id: product.id },
		}
		const response = createControllerTestResponse()

		mockPrisma.product.findUnique.mockResolvedValue(product)

		await invokeController(show, request, response)

		expect(mockPrisma.product.findUnique).toHaveBeenCalledWith({
			where: { id: product.id },
		})
		expect(response.json).toHaveBeenCalledWith({ data: product })
	})

	it("throws a not found error if the product is missing", async () => {
		const request: ControllerTestRequest<Record<string, never>> = {
			body: {},
			params: { id: "abcdefgh12345678abcdefgh" },
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

	it("updates only the provided fields and regenerates the slug when the name changes", async () => {
		const request: ControllerTestRequest<UpdateProductBody> = {
			params: { id: "abcdefgh12345678abcdefgh" },
			body: { name: "Updated Name", price: 2500 },
		}
		const response = createControllerTestResponse()
		const updated = { id: "prod-123", name: "Updated Name", price: 2500 }

		mockPrisma.product.update.mockResolvedValue(updated)

		await invokeController(update, request, response)

		expect(mockPrisma.product.update).toHaveBeenCalledWith({
			where: { id: "abcdefgh12345678abcdefgh" },
			data: {
				name: "Updated Name",
				price: 2500,
				slug: expect.stringMatching(
					/^updated-name-[0-9a-f-]{36}$/
				),
			},
		})
		expect(response.status).toHaveBeenCalledWith(200)
		expect(response.json).toHaveBeenCalledWith({ data: updated })
	})

	it("deletes a product by ID", async () => {
		const request: ControllerTestRequest<Record<string, never>> = {
			body: {},
			params: { id: "abcdefgh12345678abcdefgh" },
		}
		const response = createControllerTestResponse()

		await invokeController(destroy, request, response)

		expect(mockPrisma.product.delete).toHaveBeenCalledWith({
			where: { id: "abcdefgh12345678abcdefgh" },
		})
		expect(response.status).toHaveBeenCalledWith(200)
		expect(response.json).toHaveBeenCalledWith({
			message: "Product deleted succesfully",
		})
	})
})
