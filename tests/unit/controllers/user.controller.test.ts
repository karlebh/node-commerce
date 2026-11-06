import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	createControllerTestResponse,
	invokeController,
	type ControllerTestRequest,
} from "../../helpers/controller-test.js"

const mockPrisma = {
	user: {
		findMany: vi.fn(),
		count: vi.fn(),
		findUnique: vi.fn(),
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

const { index, show } = await import(
	"../../../src/controllers/user.controller.js"
)

const VALID_UUID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"

const userRecord = (overrides: Record<string, unknown> = {}) => ({
	id: VALID_UUID,
	username: "alice",
	email: "alice@example.com",
	createdAt: new Date("2026-01-01T00:00:00Z"),
	deletedAt: null,
	...overrides,
})

describe("User Controller", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("index", () => {
		it("returns paginated active users with publicUser shape", async () => {
			const users = [userRecord(), userRecord({ id: "u2", username: "bob" })]
			mockPrisma.user.findMany.mockResolvedValue(users)
			mockPrisma.user.count.mockResolvedValue(2)

			const request: ControllerTestRequest<Record<string, never>> = {
				body: {},
				userId: "user-1",
				sessionId: "sess-1",
				query: { page: "1", perPage: "10" },
				protocol: "http",
				get: vi.fn().mockReturnValue("example.com"),
				baseUrl: "",
				path: "/api/users",
			}
			const response = createControllerTestResponse()

			await invokeController(index, request, response)

			expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { deletedAt: null },
					skip: 0,
					take: 10,
					orderBy: { createdAt: "desc" },
				})
			)
			expect(response.status).toHaveBeenCalledWith(200)
			const payload = (response.json as ReturnType<typeof vi.fn>).mock
				.calls[0]![0]
			expect(payload.total).toBe(2)
			expect(payload.data).toHaveLength(2)
			expect(payload.data[0]).toEqual({
				id: VALID_UUID,
				username: "alice",
				email: "alice@example.com",
				createdAt: users[0]!.createdAt,
			})
		})

		it("adds a username contains filter when search is given", async () => {
			mockPrisma.user.findMany.mockResolvedValue([])
			mockPrisma.user.count.mockResolvedValue(0)

			const request: ControllerTestRequest<Record<string, never>> = {
				body: {},
				userId: "user-1",
				sessionId: "sess-1",
				query: { search: "alic" },
				protocol: "http",
				get: vi.fn().mockReturnValue("example.com"),
				baseUrl: "",
				path: "/api/users",
			}

			await invokeController(index, request, createControllerTestResponse())

			expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: {
						deletedAt: null,
						username: { contains: "alic" },
					},
				})
			)
		})
	})

	describe("show", () => {
		it("returns a user by id in publicUser shape", async () => {
			const user = userRecord()
			mockPrisma.user.findUnique.mockResolvedValue(user)

			const request: ControllerTestRequest<Record<string, never>> = {
				body: {},
				params: { id: VALID_UUID },
				userId: "user-1",
				sessionId: "sess-1",
			}
			const response = createControllerTestResponse()

			await invokeController(show, request, response)

			expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
				where: { id: VALID_UUID },
			})
			expect(response.status).toHaveBeenCalledWith(200)
			expect(response.json).toHaveBeenCalledWith({
				data: {
					user: {
						id: VALID_UUID,
						username: "alice",
						email: "alice@example.com",
						createdAt: user.createdAt,
					},
				},
			})
		})

		it("throws 404 when user is missing", async () => {
			mockPrisma.user.findUnique.mockResolvedValue(null)

			const request: ControllerTestRequest<Record<string, never>> = {
				body: {},
				params: { id: VALID_UUID },
				userId: "user-1",
				sessionId: "sess-1",
			}

			await expect(
				invokeController(show, request, createControllerTestResponse())
			).rejects.toMatchObject({ statusCode: 404 })
		})

		it("throws 404 when user is soft-deleted", async () => {
			mockPrisma.user.findUnique.mockResolvedValue(
				userRecord({ deletedAt: new Date() })
			)

			const request: ControllerTestRequest<Record<string, never>> = {
				body: {},
				params: { id: VALID_UUID },
				userId: "user-1",
				sessionId: "sess-1",
			}

			await expect(
				invokeController(show, request, createControllerTestResponse())
			).rejects.toMatchObject({ statusCode: 404 })
		})

		it("422s on a non-uuid id", async () => {
			const request: ControllerTestRequest<Record<string, never>> = {
				body: {},
				params: { id: "not-a-uuid" },
				userId: "user-1",
				sessionId: "sess-1",
			}

			await expect(
				invokeController(show, request, createControllerTestResponse())
			).rejects.toBeDefined()
		})
	})
})
