import type { RequestHandler } from "express"
import { AppError } from "../errors/AppError.js"
import { isAuthenticatedRequest } from "../types/authenticated-request.js"

type Delegate = {
	findUnique(args: { where: { id: string } }): PromiseLike<unknown>
}

export const requiresOwnership =
	(model: Delegate, ownerField = "userId"): RequestHandler =>
	async (request, response, next) => {
		try {
			if (!isAuthenticatedRequest(request)) {
				throw new AppError(401, "Authentication required")
			}

			const record = (await model.findUnique({
				where: { id: String(request.params.id) },
			})) as Record<string, unknown> | null

			if (!record || record[ownerField] !== request.userId) {
				return response.status(404).json({ message: "Not found" })
			}

			Object.assign(request, { record })

			next()
		} catch (error) {
			next(error)
		}
	}
