import { env } from "../../../configs/env.js"
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

type MeiliClient = {
	index: (name: string) => {
		addDocuments: (docs: SearchDocument[]) => Promise<unknown>
		deleteDocuments: (ids: string[]) => Promise<unknown>
		deleteAllDocuments: () => Promise<unknown>
		updateSearchableAttributes: (attrs: string[]) => Promise<unknown>
		search: (
			query: string,
			options: { limit: number; offset: number }
		) => Promise<{
			hits: SearchDocument[]
			estimatedTotalHits?: number
			totalHits?: number
		}>
	}
	createIndex: (uid: string, options?: { primaryKey: string }) => Promise<unknown>
	getIndex: (uid: string) => Promise<unknown>
}

const SEARCHABLE_ATTRIBUTES: Record<SearchIndex, string[]> = {
	products: ["name", "description", "slug"],
	categories: ["name", "slug"],
	users: ["username", "email"],
	reviews: ["title", "body"],
}

const MEILI_PACKAGE = "meilisearch"

async function loadSdk(): Promise<{
	MeiliSearch: new (options: { host: string; apiKey?: string }) => MeiliClient
}> {
	try {
		const mod = await (new Function(
			"name",
			"return import(name)"
		)(MEILI_PACKAGE) as Promise<unknown>)
		return mod as {
			MeiliSearch: new (options: {
				host: string
				apiKey?: string
			}) => MeiliClient
		}
	} catch {
		throw new Error(
			"SEARCH_DRIVER=meilisearch but the `meilisearch` package is not installed. Run `npm i meilisearch`."
		)
	}
}

export class MeilisearchProvider implements SearchProvider {
	readonly name = "meilisearch"
	private client: MeiliClient | null = null

	private async getClient(): Promise<MeiliClient> {
		if (this.client) return this.client
		const { MeiliSearch } = await loadSdk()
		this.client = new MeiliSearch({
			host: env.MEILISEARCH_HOST,
			...(env.MEILISEARCH_API_KEY && { apiKey: env.MEILISEARCH_API_KEY }),
		})
		return this.client
	}

	async init(): Promise<void> {
		const client = await this.getClient()
		for (const name of SEARCH_INDEXES) {
			try {
				await client.getIndex(name)
			} catch {
				await client.createIndex(name, { primaryKey: "id" })
			}
			await client
				.index(name)
				.updateSearchableAttributes(SEARCHABLE_ATTRIBUTES[name])
		}
	}

	async index(name: SearchIndex, docs: SearchDocument[]): Promise<void> {
		if (docs.length === 0) return
		const client = await this.getClient()
		await client.index(name).addDocuments(docs)
	}

	async remove(name: SearchIndex, ids: string[]): Promise<void> {
		if (ids.length === 0) return
		const client = await this.getClient()
		await client.index(name).deleteDocuments(ids)
	}

	async clear(name: SearchIndex): Promise<void> {
		const client = await this.getClient()
		await client.index(name).deleteAllDocuments()
	}

	async search(request: SearchQuery): Promise<SearchResult> {
		const client = await this.getClient()
		const page = Math.max(1, request.page ?? 1)
		const perPage = Math.max(1, Math.min(50, request.perPage ?? 10))
		const offset = (page - 1) * perPage
		const targets = request.indexes?.length
			? request.indexes
			: [...SEARCH_INDEXES]

		const byIndex = {} as Record<SearchIndex, IndexResult>
		for (const name of SEARCH_INDEXES) {
			byIndex[name] = { index: name, total: 0, hits: [] }
		}

		const query = request.query.trim()
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
				const response = await client
					.index(name)
					.search(query, { limit: perPage, offset })
				const hits: SearchHit[] = response.hits.map((document) => ({
					index: name,
					document,
				}))
				const total =
					response.totalHits ?? response.estimatedTotalHits ?? hits.length
				return { name, total, hits }
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
