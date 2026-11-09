import { z } from "zod"
import { SEARCH_INDEXES } from "../services/search/search.types.js"

const indexEnum = z.enum(SEARCH_INDEXES)

const splitIndexes = (value: unknown): unknown => {
	if (Array.isArray(value)) return value
	if (typeof value === "string") {
		return value
			.split(",")
			.map((segment) => segment.trim())
			.filter(Boolean)
	}
	return value
}

export const searchQuerySchema = z.object({
	q: z.string().trim().min(1).max(200),
	page: z.coerce.number().int().min(1).default(1),
	perPage: z.coerce.number().int().min(1).max(50).default(10),
	indexes: z.preprocess(splitIndexes, z.array(indexEnum).optional()),
})

export type SearchInput = z.infer<typeof searchQuerySchema>
