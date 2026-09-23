import type { RequestHandler } from "express"

type Delegate = {
	findUnique(args: { where: { id: string } }): PromiseLike<unknown>
}

export const requireOwnership =
	(model: Delegate, ownerField = "userId"): RequestHandler =>
	async (request, response, next) => {
		try {
			const record = (await model.findUnique({
				where: { id: String(request.params.id) },
			})) as Record<string, unknown> | null

			if (!record || record[ownerField] !== request.userId) {
				return response.status(404).json({ message: "Not found" })
			}

			request.record = record
			next()
		} catch (error) {
			next(error)
		}
	}
