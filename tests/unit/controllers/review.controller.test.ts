import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	createControllerTestResponse,
	invokeController,
	type ControllerTestRequest,
} from "../../helpers/controller-test.js"

const mockPrisma = {
	review: {
		create: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		findUnique: vi.fn(),
	},
}

vi.mock("../../../src/database/prisma.js", () => ({ prisma: mockPrisma }))

const { store, update, destroy } = await import(
	"../../../src/controllers/review.controller.js"
)

const PRODUCT_ID = "11111111-2222-4333-8444-555555555555"
const REVIEW_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"
const USER_ID = "user-1"

describe("Review Controller", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("store", () => {
		it("creates a review tied to the authenticated user", async () => {
			const review = {
				id: REVIEW_ID,
				userId: USER_ID,
				productId: PRODUCT_ID,
				rating: 5,
				title: "Great",
				body: "Loved it",
				isVerifiedPurchase: true,
			}
			mockPrisma.review.create.mockResolvedValue(review)

			const request: ControllerTestRequest<{
				productId: string
				rating: number
				title: string
				body: string
			}> = {
				body: {
					productId: PRODUCT_ID,
					rating: 5,
					title: "Great",
					body: "Loved it",
				},
				userId: USER_ID,
				sessionId: "sess-1",
			}
			const response = createControllerTestResponse()

			await invokeController(store, request, response)

			expect(mockPrisma.review.create).toHaveBeenCalledWith({
				data: {
					userId: USER_ID,
					productId: PRODUCT_ID,
					rating: 5,
					title: "Great",
					body: "Loved it",
					isVerifiedPurchase: true,
				},
			})
			expect(response.status).toHaveBeenCalledWith(201)
			expect(response.json).toHaveBeenCalledWith({ review })
		})

		it("422s when rating is out of range", async () => {
			const request: ControllerTestRequest<Record<string, unknown>> = {
				body: {
					productId: PRODUCT_ID,
					rating: 6,
				},
				userId: USER_ID,
				sessionId: "sess-1",
			}

			await expect(
				invokeController(store, request, createControllerTestResponse())
			).rejects.toBeDefined()
		})
	})

	describe("update", () => {
		it("updates an owned review", async () => {
			mockPrisma.review.findUnique.mockResolvedValue({
				id: REVIEW_ID,
				userId: USER_ID,
			})
			const updated = {
				id: REVIEW_ID,
				userId: USER_ID,
				productId: PRODUCT_ID,
				rating: 4,
				title: "Updated",
				body: "Still like it",
			}
			mockPrisma.review.update.mockResolvedValue(updated)

			const request: ControllerTestRequest<{
				productId: string
				rating: number
				title: string
				body: string
			}> = {
				body: {
					productId: PRODUCT_ID,
					rating: 4,
					title: "Updated",
					body: "Still like it",
				},
				params: { id: REVIEW_ID },
				userId: USER_ID,
				sessionId: "sess-1",
			}
			const response = createControllerTestResponse()

			await invokeController(update, request, response)

			expect(mockPrisma.review.update).toHaveBeenCalledWith({
				where: { id: REVIEW_ID },
				data: {
					productId: PRODUCT_ID,
					rating: 4,
					title: "Updated",
					body: "Still like it",
				},
			})
			expect(response.status).toHaveBeenCalledWith(200)
			expect(response.json).toHaveBeenCalledWith({ review: updated })
		})

		it("404s when the review belongs to another user", async () => {
			mockPrisma.review.findUnique.mockResolvedValue({
				id: REVIEW_ID,
				userId: "someone-else",
			})

			const request: ControllerTestRequest<{
				productId: string
				rating: number
				title: string
				body: string
			}> = {
				body: {
					productId: PRODUCT_ID,
					rating: 4,
					title: "Updated",
					body: "Still like it",
				},
				params: { id: REVIEW_ID },
				userId: USER_ID,
				sessionId: "sess-1",
			}

			await expect(
				invokeController(update, request, createControllerTestResponse())
			).rejects.toMatchObject({ statusCode: 404 })
			expect(mockPrisma.review.update).not.toHaveBeenCalled()
		})

		it("404s when the review does not exist", async () => {
			mockPrisma.review.findUnique.mockResolvedValue(null)

			const request: ControllerTestRequest<{
				productId: string
				rating: number
				title: string
				body: string
			}> = {
				body: {
					productId: PRODUCT_ID,
					rating: 4,
					title: "Updated",
					body: "Still like it",
				},
				params: { id: REVIEW_ID },
				userId: USER_ID,
				sessionId: "sess-1",
			}

			await expect(
				invokeController(update, request, createControllerTestResponse())
			).rejects.toMatchObject({ statusCode: 404 })
		})
	})

	describe("destroy", () => {
		it("deletes an owned review and returns 204", async () => {
			mockPrisma.review.findUnique.mockResolvedValue({
				id: REVIEW_ID,
				userId: USER_ID,
			})
			mockPrisma.review.delete.mockResolvedValue({ id: REVIEW_ID })

			const request: ControllerTestRequest<Record<string, never>> = {
				body: {},
				params: { id: REVIEW_ID },
				userId: USER_ID,
				sessionId: "sess-1",
			}
			const response = createControllerTestResponse()

			await invokeController(destroy, request, response)

			expect(mockPrisma.review.delete).toHaveBeenCalledWith({
				where: { id: REVIEW_ID },
			})
			expect(response.status).toHaveBeenCalledWith(204)
			expect(response.send).toHaveBeenCalled()
		})

		it("404s when the review belongs to another user", async () => {
			mockPrisma.review.findUnique.mockResolvedValue({
				id: REVIEW_ID,
				userId: "someone-else",
			})

			const request: ControllerTestRequest<Record<string, never>> = {
				body: {},
				params: { id: REVIEW_ID },
				userId: USER_ID,
				sessionId: "sess-1",
			}

			await expect(
				invokeController(destroy, request, createControllerTestResponse())
			).rejects.toMatchObject({ statusCode: 404 })
			expect(mockPrisma.review.delete).not.toHaveBeenCalled()
		})
	})
})
