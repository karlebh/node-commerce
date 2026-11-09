import type {
	IndexResult,
	SearchDocument,
	SearchIndex,
	SearchProvider,
	SearchQuery,
	SearchResult,
} from "../search.types.js"
import { SEARCH_INDEXES } from "../search.types.js"

export class NullSearchProvider implements SearchProvider {
	readonly name = "null"

	async init(): Promise<void> {}

	async index(_index: SearchIndex, _docs: SearchDocument[]): Promise<void> {}

	async remove(_index: SearchIndex, _ids: string[]): Promise<void> {}

	async clear(_index: SearchIndex): Promise<void> {}

	async search(request: SearchQuery): Promise<SearchResult> {
		const byIndex = {} as Record<SearchIndex, IndexResult>
		for (const name of SEARCH_INDEXES) {
			byIndex[name] = { index: name, total: 0, hits: [] }
		}
		return {
			query: request.query.trim(),
			driver: this.name,
			page: request.page ?? 1,
			perPage: request.perPage ?? 10,
			total: 0,
			hits: [],
			byIndex,
		}
	}
}
