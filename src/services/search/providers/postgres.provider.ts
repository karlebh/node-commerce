import { Prisma } from "@prisma/client"
import { prisma } from "../../../database/prisma.js"
import type {
	IndexResult,
	SearchDocument,
	SearchHit,
	SearchIndex,
	SearchProvider,
	SearchQuery,
	SearchResult,
} from "../search.types.js"
import { SEARCH_INDEXES } from "../search.types.js"

const textMode = { mode: "insensitive" as const }

type IndexSearcher = (
	query: string,
	skip: number,
	take: number
) => Promise<{ total: number; hits: SearchHit[] }>

const searchers: Record<SearchIndex, IndexSearcher> = {
	products: async (query, skip, take) => {
		const where: Prisma.ProductWhereInput = {
			isActive: true,
			deletedAt: null,
			OR: [
				{ name: { contains: query, ...textMode } },
				{ description: { contains: query, ...textMode } },
				{ slug: { contains: query, ...textMode } },
			],
		}
		const [rows, total] = await Promise.all([
			prisma.product.findMany({
				where,
				skip,
				take,
				select: {
					id: true,
					name: true,
					slug: true,
					description: true,
					price: true,
					stock: true,
					imageUrl: true,
					categoryId: true,
					userId: true,
					createdAt: true,
				},
				orderBy: { createdAt: "desc" },
			}),
			prisma.product.count({ where }),
		])
		return {
			total,
			hits: rows.map((document) => ({
				index: "products" as const,
				document: document as unknown as SearchDocument,
			})),
		}
	},
	categories: async (query, skip, take) => {
		const where: Prisma.CategoryWhereInput = {
			deletedAt: null,
			OR: [
				{ name: { contains: query, ...textMode } },
				{ slug: { contains: query, ...textMode } },
			],
		}
		const [rows, total] = await Promise.all([
			prisma.category.findMany({
				where,
				skip,
				take,
				select: { id: true, name: true, slug: true, createdAt: true },
				orderBy: { createdAt: "desc" },
			}),
			prisma.category.count({ where }),
		])
		return {
			total,
			hits: rows.map((document) => ({
				index: "categories" as const,
				document: document as unknown as SearchDocument,
			})),
		}
	},
	users: async (query, skip, take) => {
		const where: Prisma.UserWhereInput = {
			deletedAt: null,
			OR: [
				{ username: { contains: query, ...textMode } },
				{ email: { contains: query, ...textMode } },
			],
		}
		const [rows, total] = await Promise.all([
			prisma.user.findMany({
				where,
				skip,
				take,
				select: { id: true, username: true, createdAt: true },
				orderBy: { createdAt: "desc" },
			}),
			prisma.user.count({ where }),
		])
		return {
			total,
			hits: rows.map((document) => ({
				index: "users" as const,
				document: document as unknown as SearchDocument,
			})),
		}
	},
	reviews: async (query, skip, take) => {
		const where: Prisma.ReviewWhereInput = {
			deletedAt: null,
			isApproved: true,
			OR: [
				{ title: { contains: query, ...textMode } },
				{ body: { contains: query, ...textMode } },
			],
		}
		const [rows, total] = await Promise.all([
			prisma.review.findMany({
				where,
				skip,
				take,
				select: {
					id: true,
					title: true,
					body: true,
					rating: true,
					productId: true,
					userId: true,
					createdAt: true,
				},
				orderBy: { createdAt: "desc" },
			}),
			prisma.review.count({ where }),
		])
		return {
			total,
			hits: rows.map((document) => ({
				index: "reviews" as const,
				document: document as unknown as SearchDocument,
			})),
		}
	},
}

export class PostgresSearchProvider implements SearchProvider {
	readonly name = "postgres"

	async init(): Promise<void> {}

	async index(_index: SearchIndex, _docs: SearchDocument[]): Promise<void> {}

	async remove(_index: SearchIndex, _ids: string[]): Promise<void> {}

	async clear(_index: SearchIndex): Promise<void> {}

	async search(request: SearchQuery): Promise<SearchResult> {
		const page = Math.max(1, request.page ?? 1)
		const perPage = Math.max(1, Math.min(50, request.perPage ?? 10))
		const skip = (page - 1) * perPage

		const targets = request.indexes?.length
			? request.indexes
			: [...SEARCH_INDEXES]

		const query = request.query.trim()
		const byIndex = {} as Record<SearchIndex, IndexResult>
		for (const name of SEARCH_INDEXES) {
			byIndex[name] = { index: name, total: 0, hits: [] }
		}

		if (!query) {
			return {
				query,
				driver: this.name,
				page,
				perPage,
				total: 0,
				hits: [],
				byIndex,
			}
		}

		const results = await Promise.all(
			targets.map(async (name) => {
				const searcher = searchers[name]
				const result = await searcher(query, skip, perPage)
				return { name, ...result }
			})
		)

		let total = 0
		const hits: SearchHit[] = []
		for (const { name, total: indexTotal, hits: indexHits } of results) {
			byIndex[name] = { index: name, total: indexTotal, hits: indexHits }
			total += indexTotal
			hits.push(...indexHits)
		}

		return { query, driver: this.name, page, perPage, total, hits, byIndex }
	}
}
