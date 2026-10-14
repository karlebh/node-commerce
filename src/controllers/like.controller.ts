import type { RequestHandler } from "express"
import type { AuthenticatedHandler } from "../middleware/protectedHandler.js"
import { prisma } from "../database/prisma.js"
import {
	createLikeSchema,
	destroyLikeSchema,
} from "../validations/like.schema.js"
import { AppError } from "../errors/AppError.js"
import { resolvePolymorphic } from "../helpers/index.js"

export const like: AuthenticatedHandler = async (request, response) => {
	const { likeableId, likeableType } = createLikeSchema.parse(request.body)

	const userId = request.userId

	const like = await prisma.$transaction(async (tx) => {
		// fetch or create
		const created = await tx.like.upsert({
			where: {
				likeableId_likeableType_userId: {
					userId,
					likeableId,
					likeableType,
				},
			},
			create: { userId, likeableId, likeableType },
			update: {},
		})

		if (!created) throw new AppError(500, "Error creating like")

		const owner = await resolvePolymorphic(
			tx,
			created.likeableType,
			created.likeableId
		)

		return { ...created, owner }
	})

	return response
		.status(201)
		.json({ message: "Like created successfully", like })
}

export const unlike: RequestHandler = async (request, response) => {
	const { likeId } = destroyLikeSchema.parse(request.params)

	const deleted = await prisma.$transaction(async (tx) => {
		const exists = await tx.like.findUnique({ where: { id: likeId } })
	})
}
