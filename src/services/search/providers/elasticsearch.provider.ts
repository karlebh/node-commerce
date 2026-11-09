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

type BulkOperation =
	| { index: { _index: string; _id: string } }
	| { delete: { _index: string; _id: string } }
	| SearchDocument

type ElasticClient = {
	indices: {
		exists: (args: { index: string }) => Promise<boolean>
		create: (args: { index: string }) => Promise<unknown>
		refresh: (args: { index: string }) => Promise<unknown>
	}
	bulk: (args: {
		refresh: boolean
		operations: BulkOperation[]
	}) => Promise<unknown>
	deleteByQuery: (args: {
		index: string
		query: { match_all: Record<string, never> }
	}) => Promise<unknown>
	search: (args: {
		index: string
		from: number
		size: number
		query: {
			multi_match: {
				query: string
				fields: string[]
				fuzziness: string
			}
		}
	}) => Promise<{
		hits: {
			total: { value: number } | number
			hits: Array<{ _id: string; _score: number; _source: SearchDocument }>
		}
	}>
}

const SEARCHABLE_FIELDS: Record<SearchIndex, string[]> = {
	products: ["name^3", "description", "slug"],
	categories: ["name^2", "slug"],
	users: ["username^2", "email"],
	reviews: ["title^2", "body"],
}

type ClientOptions = {
	node: string
	auth?: { apiKey: string } | { username: string; password: string }
}

const ELASTIC_PACKAGE = "@elastic/elasticsearch"

async function loadSdk(): Promise<{
	Client: new (options: ClientOptions) => ElasticClient
}> {
	try {
		const mod = await (new Function(
			"name",
			"return import(name)"
		)(ELASTIC_PACKAGE) as Promise<unknown>)
		return mod as {
			Client: new (options: ClientOptions) => ElasticClient
		}
	} catch {
		throw new Error(
			"SEARCH_DRIVER=elasticsearch but the `@elastic/elasticsearch` package is not installed. Run `npm i @elastic/elasticsearch`."
		)
	}
}

function buildAuth(): ClientOptions["auth"] {
	if (env.ELASTICSEARCH_API_KEY) {
		return { apiKey: env.ELASTICSEARCH_API_KEY }
	}
	if (env.ELASTICSEARCH_USERNAME && env.ELASTICSEARCH_PASSWORD) {
		return {
			username: env.ELASTICSEARCH_USERNAME,
			password: env.ELASTICSEARCH_PASSWORD,
		}
	}
	return undefined
}

export class ElasticsearchProvider implements SearchProvider {
	readonly name = "elasticsearch"
	private client: ElasticClient | null = null

	private async getClient(): Promise<ElasticClient> {
		if (this.client) return this.client
		const { Client } = await loadSdk()
		const auth = buildAuth()
		this.client = new Client({
			node: env.ELASTICSEARCH_HOST,
			...(auth && { auth }),
		})
		return this.client
	}

	async init(): Promise<void> {
		const client = await this.getClient()
		for (const name of SEARCH_INDEXES) {
			const exists = await client.indices.exists({ index: name })
			if (!exists) await client.indices.create({ index: name })
		}
	}

	async index(name: SearchIndex, docs: SearchDocument[]): Promise<void> {
		if (docs.length === 0) return
		const client = await this.getClient()
		const operations: BulkOperation[] = docs.flatMap((doc) => [
			{ index: { _index: name, _id: doc.id } },
			doc,
		])
		await client.bulk({ refresh: true, operations })
	}

	async remove(name: SearchIndex, ids: string[]): Promise<void> {
		if (ids.length === 0) return
		const client = await this.getClient()
		const operations: BulkOperation[] = ids.map((id) => ({
			delete: { _index: name, _id: id },
		}))
		await client.bulk({ refresh: true, operations })
	}

	async clear(name: SearchIndex): Promise<void> {
		const client = await this.getClient()
		await client.deleteByQuery({ index: name, query: { match_all: {} } })
		await client.indices.refresh({ index: name })
	}

	async search(request: SearchQuery): Promise<SearchResult> {
		const client = await this.getClient()
		const page = Math.max(1, request.page ?? 1)
		const perPage = Math.max(1, Math.min(50, request.perPage ?? 10))
		const from = (page - 1) * perPage
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
				const response = await client.search({
					index: name,
					from,
					size: perPage,
					query: {
						multi_match: {
							query,
							fields: SEARCHABLE_FIELDS[name],
							fuzziness: "AUTO",
						},
					},
				})
				const total =
					typeof response.hits.total === "number"
						? response.hits.total
						: response.hits.total.value
				const hits: SearchHit[] = response.hits.hits.map((hit) => ({
					index: name,
					document: { ...hit._source, id: hit._id },
					score: hit._score,
				}))
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
