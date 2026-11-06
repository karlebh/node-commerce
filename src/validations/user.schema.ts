import { z } from "zod"

export const userParamSchema = z.object({
	id: z.uuid(),
})

export type UserParams = z.infer<typeof userParamSchema>
