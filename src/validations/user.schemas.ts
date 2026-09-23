import { z } from "zod"

export const registerUserSchema = z.object({
	username: z.string().trim().min(2).max(20),
	email: z.string().trim().email().toLowerCase(),
	password: z.string().min(8).max(72),
})

export const loginUserSchema = registerUserSchema.pick({
	email: true,
	password: true,
})
