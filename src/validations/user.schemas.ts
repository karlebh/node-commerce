import { z } from "zod"

const baseRegisterSchema = z.object({
	username: z.string().trim().min(2).max(20),
	email: z.string().trim().email().toLowerCase(),
	password: z.string().min(8).max(72),
	password_confirmation: z.string(),
})

export const registerUserSchema = baseRegisterSchema.refine(
	(data) => data.password === data.password_confirmation,
	{
		message: "Passwords do not match",
		path: ["password_confirmation"],
	}
)

export const loginUserSchema = baseRegisterSchema.pick({
	email: true,
	password: true,
})
