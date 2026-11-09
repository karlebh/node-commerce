export const SEARCH_INDEXES = [
	"products",
	"categories",
	"users",
	"reviews",
] as const

export type SearchIndex = (typeof SEARCH_INDEXES)[number]

export type SearchDocument = { id: string } & Record<string, unknown>

export type SearchHit = {
	index: SearchIndex
	document: SearchDocument
	score?: number
}

export type SearchQuery = {
	query: string
	indexes?: SearchIndex[]
	page?: number
	perPage?: number
}

export type IndexResult = {
	index: SearchIndex
	total: number
	hits: SearchHit[]
}

export type SearchResult = {
	query: string
	driver: string
	page: number
	perPage: number
	total: number
	hits: SearchHit[]
	byIndex: Record<SearchIndex, IndexResult>
}

export interface SearchProvider {
	readonly name: string
	init(): Promise<void>
	index(index: SearchIndex, docs: SearchDocument[]): Promise<void>
	remove(index: SearchIndex, ids: string[]): Promise<void>
	clear(index: SearchIndex): Promise<void>
	search(query: SearchQuery): Promise<SearchResult>
}
