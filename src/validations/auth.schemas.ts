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

export const resetPasswordSchema = baseRegisterSchema.pick({ email: true })

export const changePasswordSchema = z
	.object({
		current_password: z.string(),
		password: baseRegisterSchema.shape.password,
		password_confirmation: z.string(),
	})
	.refine((data) => data.password === data.password_confirmation, {
		message: "Passwords do not match",
		path: ["password_confirmation"],
	})
	.refine((data) => data.password !== data.current_password, {
		message: "New password must be different from the current one",
		path: ["password"],
	})

export const confirmPasswordResetSchema = z
	.object({
		token: z.string().min(64, "Reset token is required"),
		password: z
			.string()
			.min(8, "Password must be at least 8 characters")
			.max(72, "Password must not exceed 72 characters"),
		passwordConfirmation: z
			.string()
			.min(1, "Password confirmation is required"),
	})
	.refine((data) => data.password === data.passwordConfirmation, {
		message: "Passwords do not match",
		path: ["passwordConfirmation"],
	})
