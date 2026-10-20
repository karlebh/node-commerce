import { z } from "zod"

const passwordConfirmationSchema = z.string().min(1)

const normalizePasswordConfirmation = (
	value: string | undefined,
	otherValue: string | undefined
): string | undefined => value ?? otherValue

const baseRegisterFieldsSchema = z.object({
	username: z.string().trim().min(2).max(20),
	email: z.string().trim().email().toLowerCase(),
	password: z.string().min(8).max(72),
	password_confirmation: passwordConfirmationSchema.optional(),
	passwordConfirmation: passwordConfirmationSchema.optional(),
})

export const registerUserSchema = baseRegisterFieldsSchema.refine(
	(data) => {
		const confirmation = normalizePasswordConfirmation(
			data.passwordConfirmation,
			data.password_confirmation
		)

		if (!confirmation) return true
		return data.password === confirmation
	},
	{
		message: "Passwords do not match",
		path: ["password_confirmation"],
	}
)

export const loginUserSchema = baseRegisterFieldsSchema.pick({
	email: true,
	password: true,
})

export const resetPasswordSchema = baseRegisterFieldsSchema.pick({ email: true })

export const changePasswordSchema = z
	.object({
		current_password: z.string(),
		password: baseRegisterFieldsSchema.shape.password,
		password_confirmation: passwordConfirmationSchema.optional(),
		passwordConfirmation: passwordConfirmationSchema.optional(),
	})
	.refine(
		(data) => {
			const confirmation = normalizePasswordConfirmation(
				data.passwordConfirmation,
				data.password_confirmation
			)

			if (!confirmation) return true
			return data.password === confirmation
		},
		{
			message: "Passwords do not match",
			path: ["password_confirmation"],
		}
	)
	.refine((data) => data.password !== data.current_password, {
		message: "New password must be different from the current one",
		path: ["password"],
	})

export const confirmPasswordResetTokenSchema = z.object({
	token: z.string().min(1, "Reset token is required"),
})

export const confirmPasswordResetBodySchema = z
	.object({
		password: z
			.string()
			.min(8, "Password must be at least 8 characters")
			.max(72, "Password must not exceed 72 characters"),
		passwordConfirmation: passwordConfirmationSchema.optional(),
		password_confirmation: passwordConfirmationSchema.optional(),
	})
	.refine(
		(data) => {
			const confirmation = normalizePasswordConfirmation(
				data.passwordConfirmation,
				data.password_confirmation
			)

			if (!confirmation) return true
			return data.password === confirmation
		},
		{
			message: "Passwords do not match",
			path: ["passwordConfirmation"],
		}
	)

export const confirmPasswordResetSchema =
	confirmPasswordResetTokenSchema.merge(confirmPasswordResetBodySchema)
