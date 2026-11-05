import { LikeableType } from "@prisma/client"
import { z } from "zod"

export const createLikeSchema = z.object({
	likeableId: z.uuid(),
	likeableType: z.enum(LikeableType),
})

export const destroyLikeSchema = z.object({
	likeId: z.uuid(),
})

export type CreateLikeInput = z.infer<typeof createLikeSchema>
export type DestroyLikeInput = z.infer<typeof destroyLikeSchema>
