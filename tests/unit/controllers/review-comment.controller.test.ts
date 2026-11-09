import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	createControllerTestResponse,
	invokeController,
	type ControllerTestRequest,
} from "../../helpers/controller-test.js"

const mockPrisma = {
	review: {
		findUnique: vi.fn(),
	},
	reviewComment: {
		findMany: vi.fn(),
		count: vi.fn(),
		findUnique: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
	},
}

vi.mock("../../../src/database/prisma.js", () => ({ prisma: mockPrisma }))

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
	}) => ({ data, total, current_page: page, per_page: perPage }),
}))

const { index, store, update, destroy } = await import(
	"../../../src/controllers/review-comment.controller.js"
)

const REVIEW_ID = "11111111-2222-4333-8444-555555555555"
const PARENT_ID = "22222222-3333-4444-8555-666666666666"
const COMMENT_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"
const USER_ID = "user-1"

const authed = <B>(req: Partial<ControllerTestRequest<B>>): ControllerTestRequest<B> =>
	({
		body: {} as B,
		userId: USER_ID,
		sessionId: "sess-1",
		...req,
	}) as ControllerTestRequest<B>

describe("Review Comment Controller", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("index", () => {
		it("lists comments paginated with reply counts included", async () => {
			const comments = [
				{ id: COMMENT_ID, body: "nice", _count: { replies: 2 } },
			]
			mockPrisma.reviewComment.findMany.mockResolvedValue(comments)
			mockPrisma.reviewComment.count.mockResolvedValue(1)

			const request = authed<Record<string, never>>({
				params: { reviewId: REVIEW_ID },
				query: { page: "1", perPage: "10" },
				protocol: "http",
				get: vi.fn().mockReturnValue("example.com"),
				baseUrl: "",
				path: `/api/reviews/${REVIEW_ID}/comments`,
			})
			const response = createControllerTestResponse()

			await invokeController(index, request, response)

			expect(mockPrisma.reviewComment.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { reviewId: REVIEW_ID, deletedAt: null },
					orderBy: { createdAt: "asc" },
					include: { _count: { select: { replies: true } } },
				})
			)
			expect(response.status).toHaveBeenCalledWith(200)
			expect(response.json).toHaveBeenCalledWith(
				expect.objectContaining({ data: comments, total: 1 })
			)
		})

		it("filters to top-level comments when topLevelOnly=true", async () => {
			mockPrisma.reviewComment.findMany.mockResolvedValue([])
			mockPrisma.reviewComment.count.mockResolvedValue(0)

			const request = authed<Record<string, never>>({
				params: { reviewId: REVIEW_ID },
				query: { topLevelOnly: "true" },
				protocol: "http",
				get: vi.fn().mockReturnValue("example.com"),
				baseUrl: "",
				path: `/api/reviews/${REVIEW_ID}/comments`,
			})

			await invokeController(index, request, createControllerTestResponse())

			expect(mockPrisma.reviewComment.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: {
						reviewId: REVIEW_ID,
						deletedAt: null,
						parentId: null,
					},
				})
			)
		})

		it("filters by parentId when given", async () => {
			mockPrisma.reviewComment.findMany.mockResolvedValue([])
			mockPrisma.reviewComment.count.mockResolvedValue(0)

			const request = authed<Record<string, never>>({
				params: { reviewId: REVIEW_ID },
				query: { parentId: PARENT_ID },
				protocol: "http",
				get: vi.fn().mockReturnValue("example.com"),
				baseUrl: "",
				path: `/api/reviews/${REVIEW_ID}/comments`,
			})

			await invokeController(index, request, createControllerTestResponse())

			expect(mockPrisma.reviewComment.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: {
						reviewId: REVIEW_ID,
						deletedAt: null,
						parentId: PARENT_ID,
					},
				})
			)
		})
	})

	describe("store", () => {
		it("creates a top-level comment", async () => {
			mockPrisma.review.findUnique.mockResolvedValue({
				id: REVIEW_ID,
				deletedAt: null,
			})
			const created = {
				id: COMMENT_ID,
				reviewId: REVIEW_ID,
				userId: USER_ID,
				body: "ok",
				parentId: null,
			}
			mockPrisma.reviewComment.create.mockResolvedValue(created)

			const request = authed<{ body: string }>({
				params: { reviewId: REVIEW_ID },
				body: { body: "ok" },
			})
			const response = createControllerTestResponse()

			await invokeController(store, request, response)

			expect(mockPrisma.reviewComment.create).toHaveBeenCalledWith({
				data: { reviewId: REVIEW_ID, userId: USER_ID, body: "ok" },
			})
			expect(response.status).toHaveBeenCalledWith(201)
			expect(response.json).toHaveBeenCalledWith({ data: created })
		})

		it("creates a reply when parentId belongs to the review", async () => {
			mockPrisma.review.findUnique.mockResolvedValue({
				id: REVIEW_ID,
				deletedAt: null,
			})
			mockPrisma.reviewComment.findUnique.mockResolvedValue({
				reviewId: REVIEW_ID,
				deletedAt: null,
			})
			mockPrisma.reviewComment.create.mockResolvedValue({
				id: COMMENT_ID,
				parentId: PARENT_ID,
			})

			const request = authed<{ body: string; parentId: string }>({
				params: { reviewId: REVIEW_ID },
				body: { body: "reply", parentId: PARENT_ID },
			})

			await invokeController(store, request, createControllerTestResponse())

			expect(mockPrisma.reviewComment.create).toHaveBeenCalledWith({
				data: {
					reviewId: REVIEW_ID,
					userId: USER_ID,
					body: "reply",
					parentId: PARENT_ID,
				},
			})
		})

		it("404s when the review does not exist", async () => {
			mockPrisma.review.findUnique.mockResolvedValue(null)

			const request = authed<{ body: string }>({
				params: { reviewId: REVIEW_ID },
				body: { body: "hi" },
			})

			await expect(
				invokeController(store, request, createControllerTestResponse())
			).rejects.toMatchObject({ statusCode: 404 })
			expect(mockPrisma.reviewComment.create).not.toHaveBeenCalled()
		})

		it("404s when parent comment belongs to a different review", async () => {
			mockPrisma.review.findUnique.mockResolvedValue({
				id: REVIEW_ID,
				deletedAt: null,
			})
			mockPrisma.reviewComment.findUnique.mockResolvedValue({
				reviewId: "other-review",
				deletedAt: null,
			})

			const request = authed<{ body: string; parentId: string }>({
				params: { reviewId: REVIEW_ID },
				body: { body: "reply", parentId: PARENT_ID },
			})

			await expect(
				invokeController(store, request, createControllerTestResponse())
			).rejects.toMatchObject({ statusCode: 404 })
			expect(mockPrisma.reviewComment.create).not.toHaveBeenCalled()
		})

		it("422s on an empty body", async () => {
			const request = authed<{ body: string }>({
				params: { reviewId: REVIEW_ID },
				body: { body: "" },
			})

			await expect(
				invokeController(store, request, createControllerTestResponse())
			).rejects.toBeDefined()
		})
	})

	describe("update", () => {
		it("edits an owned comment", async () => {
			mockPrisma.reviewComment.findUnique.mockResolvedValue({
				id: COMMENT_ID,
				userId: USER_ID,
				deletedAt: null,
			})
			const updated = { id: COMMENT_ID, body: "edited" }
			mockPrisma.reviewComment.update.mockResolvedValue(updated)

			const request = authed<{ body: string }>({
				params: { id: COMMENT_ID },
				body: { body: "edited" },
			})
			const response = createControllerTestResponse()

			await invokeController(update, request, response)

			expect(mockPrisma.reviewComment.update).toHaveBeenCalledWith({
				where: { id: COMMENT_ID },
				data: { body: "edited" },
			})
			expect(response.status).toHaveBeenCalledWith(200)
			expect(response.json).toHaveBeenCalledWith({ data: updated })
		})

		it("404s on another user's comment", async () => {
			mockPrisma.reviewComment.findUnique.mockResolvedValue({
				id: COMMENT_ID,
				userId: "someone-else",
				deletedAt: null,
			})

			const request = authed<{ body: string }>({
				params: { id: COMMENT_ID },
				body: { body: "edit" },
			})

			await expect(
				invokeController(update, request, createControllerTestResponse())
			).rejects.toMatchObject({ statusCode: 404 })
		})

		it("404s on a soft-deleted comment", async () => {
			mockPrisma.reviewComment.findUnique.mockResolvedValue({
				id: COMMENT_ID,
				userId: USER_ID,
				deletedAt: new Date(),
			})

			const request = authed<{ body: string }>({
				params: { id: COMMENT_ID },
				body: { body: "edit" },
			})

			await expect(
				invokeController(update, request, createControllerTestResponse())
			).rejects.toMatchObject({ statusCode: 404 })
		})
	})

	describe("destroy", () => {
		it("soft-deletes an owned comment and returns 204", async () => {
			mockPrisma.reviewComment.findUnique.mockResolvedValue({
				id: COMMENT_ID,
				userId: USER_ID,
				deletedAt: null,
			})
			mockPrisma.reviewComment.update.mockResolvedValue({ id: COMMENT_ID })

			const request = authed<Record<string, never>>({
				params: { id: COMMENT_ID },
			})
			const response = createControllerTestResponse()

			await invokeController(destroy, request, response)

			expect(mockPrisma.reviewComment.update).toHaveBeenCalledWith({
				where: { id: COMMENT_ID },
				data: { deletedAt: expect.any(Date) },
			})
			expect(response.status).toHaveBeenCalledWith(204)
			expect(response.send).toHaveBeenCalled()
		})

		it("404s on another user's comment", async () => {
			mockPrisma.reviewComment.findUnique.mockResolvedValue({
				id: COMMENT_ID,
				userId: "someone-else",
				deletedAt: null,
			})

			const request = authed<Record<string, never>>({
				params: { id: COMMENT_ID },
			})

			await expect(
				invokeController(destroy, request, createControllerTestResponse())
			).rejects.toMatchObject({ statusCode: 404 })
			expect(mockPrisma.reviewComment.update).not.toHaveBeenCalled()
		})
	})
})
