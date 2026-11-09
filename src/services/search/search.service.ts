import { prisma } from "../../database/prisma.js"
import { logger } from "../../lib/logger.js"
import { createSearchProvider } from "./search.factory.js"
import type {
	SearchDocument,
	SearchIndex,
	SearchProvider,
	SearchQuery,
	SearchResult,
} from "./search.types.js"
import { SEARCH_INDEXES } from "./search.types.js"

const provider: SearchProvider = createSearchProvider()

export const searchDriver = provider.name

type ProductDoc = SearchDocument & {
	name: string
	slug: string
	description: string
	price: number
	stock: number
	imageUrl: string | null
	categoryId: string
	userId: string
	isActive: boolean
	createdAt: number
}

type CategoryDoc = SearchDocument & {
	name: string
	slug: string
	createdAt: number
}

type UserDoc = SearchDocument & {
	username: string
	email: string
	createdAt: number
}

type ReviewDoc = SearchDocument & {
	productId: string
	userId: string
	title: string | null
	body: string | null
	rating: number
	isApproved: boolean
	createdAt: number
}

const toEpoch = (date: Date): number => Math.floor(date.getTime() / 1000)

export function mapProduct(product: {
	id: string
	name: string
	slug: string
	description: string
	price: number
	stock: number
	imageUrl: string | null
	categoryId: string
	userId: string
	isActive: boolean
	createdAt: Date
}): ProductDoc {
	return {
		id: product.id,
		name: product.name,
		slug: product.slug,
		description: product.description,
		price: product.price,
		stock: product.stock,
		imageUrl: product.imageUrl,
		categoryId: product.categoryId,
		userId: product.userId,
		isActive: product.isActive,
		createdAt: toEpoch(product.createdAt),
	}
}

export function mapCategory(category: {
	id: string
	name: string
	slug: string
	createdAt: Date
}): CategoryDoc {
	return {
		id: category.id,
		name: category.name,
		slug: category.slug,
		createdAt: toEpoch(category.createdAt),
	}
}

export function mapUser(user: {
	id: string
	username: string
	email: string
	createdAt: Date
}): UserDoc {
	return {
		id: user.id,
		username: user.username,
		email: user.email,
		createdAt: toEpoch(user.createdAt),
	}
}

export function mapReview(review: {
	id: string
	productId: string
	userId: string
	title: string | null
	body: string | null
	rating: number
	isApproved: boolean
	createdAt: Date
}): ReviewDoc {
	return {
		id: review.id,
		productId: review.productId,
		userId: review.userId,
		title: review.title,
		body: review.body,
		rating: review.rating,
		isApproved: review.isApproved,
		createdAt: toEpoch(review.createdAt),
	}
}

async function safeCall<T>(
	operation: string,
	run: () => Promise<T>
): Promise<T | undefined> {
	try {
		return await run()
	} catch (error) {
		logger.warn(
			{ err: error, operation, driver: provider.name },
			"Search provider operation failed; continuing"
		)
		return undefined
	}
}

export const searchService = {
	driver: provider.name,

	init(): Promise<void> {
		return provider.init()
	},

	search(query: SearchQuery): Promise<SearchResult> {
		return provider.search(query)
	},

	indexDocuments(index: SearchIndex, docs: SearchDocument[]): Promise<void> {
		return provider.index(index, docs)
	},

	removeDocuments(index: SearchIndex, ids: string[]): Promise<void> {
		return provider.remove(index, ids)
	},

	clearIndex(index: SearchIndex): Promise<void> {
		return provider.clear(index)
	},

	indexProduct(product: Parameters<typeof mapProduct>[0]): Promise<void> {
		return safeCall("indexProduct", () =>
			provider.index("products", [mapProduct(product)])
		).then(() => undefined)
	},

	removeProduct(id: string): Promise<void> {
		return safeCall("removeProduct", () =>
			provider.remove("products", [id])
		).then(() => undefined)
	},

	indexCategory(category: Parameters<typeof mapCategory>[0]): Promise<void> {
		return safeCall("indexCategory", () =>
			provider.index("categories", [mapCategory(category)])
		).then(() => undefined)
	},

	removeCategory(id: string): Promise<void> {
		return safeCall("removeCategory", () =>
			provider.remove("categories", [id])
		).then(() => undefined)
	},

	indexUser(user: Parameters<typeof mapUser>[0]): Promise<void> {
		return safeCall("indexUser", () =>
			provider.index("users", [mapUser(user)])
		).then(() => undefined)
	},

	removeUser(id: string): Promise<void> {
		return safeCall("removeUser", () =>
			provider.remove("users", [id])
		).then(() => undefined)
	},

	indexReview(review: Parameters<typeof mapReview>[0]): Promise<void> {
		return safeCall("indexReview", () =>
			provider.index("reviews", [mapReview(review)])
		).then(() => undefined)
	},

	removeReview(id: string): Promise<void> {
		return safeCall("removeReview", () =>
			provider.remove("reviews", [id])
		).then(() => undefined)
	},

	async reindexAll(
		options: { indexes?: SearchIndex[]; batchSize?: number } = {}
	): Promise<Record<SearchIndex, number>> {
		const targets = options.indexes?.length
			? options.indexes
			: [...SEARCH_INDEXES]
		const batchSize = options.batchSize ?? 500
		const counts = {} as Record<SearchIndex, number>
		for (const name of SEARCH_INDEXES) counts[name] = 0

		await provider.init()

		for (const name of targets) {
			await provider.clear(name)
			counts[name] = await reindexIndex(name, batchSize)
		}

		return counts
	},
}

async function reindexIndex(
	name: SearchIndex,
	batchSize: number
): Promise<number> {
	let total = 0
	let cursor: string | undefined
	while (true) {
		const batch = await fetchBatch(name, cursor, batchSize)
		if (batch.length === 0) break
		await provider.index(name, batch.map(({ doc }) => doc))
		total += batch.length
		const last = batch[batch.length - 1]
		if (!last) break
		cursor = last.id
		if (batch.length < batchSize) break
	}
	return total
}

async function fetchBatch(
	name: SearchIndex,
	cursor: string | undefined,
	batchSize: number
): Promise<Array<{ id: string; doc: SearchDocument }>> {
	switch (name) {
		case "products": {
			const rows = await prisma.product.findMany({
				where: { deletedAt: null },
				take: batchSize,
				...(cursor && { skip: 1, cursor: { id: cursor } }),
				orderBy: { id: "asc" },
			})
			return rows.map((row) => ({ id: row.id, doc: mapProduct(row) }))
		}
		case "categories": {
			const rows = await prisma.category.findMany({
				where: { deletedAt: null },
				take: batchSize,
				...(cursor && { skip: 1, cursor: { id: cursor } }),
				orderBy: { id: "asc" },
			})
			return rows.map((row) => ({ id: row.id, doc: mapCategory(row) }))
		}
		case "users": {
			const rows = await prisma.user.findMany({
				where: { deletedAt: null },
				take: batchSize,
				...(cursor && { skip: 1, cursor: { id: cursor } }),
				orderBy: { id: "asc" },
			})
			return rows.map((row) => ({ id: row.id, doc: mapUser(row) }))
		}
		case "reviews": {
			const rows = await prisma.review.findMany({
				where: { deletedAt: null },
				take: batchSize,
				...(cursor && { skip: 1, cursor: { id: cursor } }),
				orderBy: { id: "asc" },
			})
			return rows.map((row) => ({ id: row.id, doc: mapReview(row) }))
		}
	}
}
