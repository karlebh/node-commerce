import type { Request, RequestHandler, Response } from "express"
import { searchQuerySchema } from "../validations/search.schema.js"
import { searchService } from "../services/search/search.service.js"

export const index: RequestHandler = async (
	request: Request,
	response: Response
): Promise<Response> => {
	const parsed = searchQuerySchema.parse(request.query)

	const result = await searchService.search({
		query: parsed.q,
		page: parsed.page,
		perPage: parsed.perPage,
		...(parsed.indexes && { indexes: parsed.indexes }),
	})

	return response.status(200).json({ data: result })
}
