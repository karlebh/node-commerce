import type { Request, RequestHandler, Response } from "express"
import type { AuthenticatedHandler, AuthenticatedRequest } from "../middleware/protectedHandler.js"
import { prisma } from "../database/prisma.js"
import {
	createLikeSchema,
	destroyLikeSchema,
} from "../validations/like.schema.js"
import { resolvePolymorphic } from "../helpers/index.js"

export const like: AuthenticatedHandler = async (request: AuthenticatedRequest, response: Response) => {
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

export const unlike: RequestHandler = async (request: Request, response: Response) => {
	const { likeId } = destroyLikeSchema.parse(request.params)

	await prisma.like.delete({
		where: { id: likeId },
	})

	return response.status(200).json({
		message: "Like deleted successfully",
	})
}
