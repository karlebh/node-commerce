import type { Response } from "express"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import { publicUser } from "../helpers/index.js"
import { paginate } from "../lib/paginate.js"
import type {
	AuthenticatedHandler,
	AuthenticatedRequest,
} from "../middleware/protectedHandler.js"
import { userParamSchema } from "../validations/user.schema.js"
import { urlQuerySchema } from "../validations/url-query.schema.js"

export const index: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { page, perPage, search } = urlQuerySchema.parse(request.query)

	const where = {
		deletedAt: null,
		...(search ? { username: { contains: search } } : {}),
	}

	const [users, total] = await Promise.all([
		prisma.user.findMany({
			where,
			skip: (page - 1) * perPage,
			take: perPage,
			orderBy: { createdAt: "desc" },
		}),
		prisma.user.count({ where }),
	])

	return response.status(200).json(
		paginate({
			request,
			data: users.map(publicUser),
			total,
			page,
			perPage,
		})
	)
}

export const show: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { id } = userParamSchema.parse(request.params)

	const user = await prisma.user.findUnique({ where: { id } })
	if (!user || user.deletedAt) throw new AppError(404, "User not found")

	return response.status(200).json({ data: { user: publicUser(user) } })
}
