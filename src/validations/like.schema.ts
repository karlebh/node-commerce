import { LikeableType } from "@prisma/client"
import { z } from "zod"

export const createLikeSchema = z.object({
	likeableId: z.cuid2(),
	likeableType: z.enum(LikeableType),
})

export const destroyLikeSchema = z.object({
	likeId: z.cuid2(),
})

export type CreateLikeInput = z.infer<typeof createLikeSchema>
export type DestroyLikeInput = z.infer<typeof destroyLikeSchema>
