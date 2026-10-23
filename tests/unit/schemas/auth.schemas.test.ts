import { describe, it, expect } from "vitest"
import {
	registerUserSchema,
	loginUserSchema,
	resetPasswordSchema,
	changePasswordSchema,
	confirmPasswordResetBodySchema,
	confirmPasswordResetTokenSchema,
} from "../../../src/validations/auth.schemas.js"

describe("registerUserSchema", () => {
	it("accepts valid payload without confirmation", () => {
		const parsed = registerUserSchema.parse({
			username: "jane",
			email: "JANE@example.com",
			password: "longenoughpassword",
		})
		expect(parsed.email).toBe("jane@example.com")
	})

	it("accepts matching snake_case confirmation", () => {
		expect(() =>
			registerUserSchema.parse({
				username: "jane",
				email: "jane@example.com",
				password: "longenough",
				password_confirmation: "longenough",
			})
		).not.toThrow()
	})

	it("accepts matching camelCase confirmation", () => {
		expect(() =>
			registerUserSchema.parse({
				username: "jane",
				email: "jane@example.com",
				password: "longenough",
				passwordConfirmation: "longenough",
			})
		).not.toThrow()
	})

	it("rejects mismatched confirmation", () => {
		expect(() =>
			registerUserSchema.parse({
				username: "jane",
				email: "jane@example.com",
				password: "longenough",
				password_confirmation: "different",
			})
		).toThrow()
	})

	it("rejects short username", () => {
		expect(() =>
			registerUserSchema.parse({
				username: "a",
				email: "jane@example.com",
				password: "longenough",
			})
		).toThrow()
	})

	it("rejects short password", () => {
		expect(() =>
			registerUserSchema.parse({
				username: "jane",
				email: "jane@example.com",
				password: "short",
			})
		).toThrow()
	})
})

describe("loginUserSchema", () => {
	it("requires email and password only", () => {
		const parsed = loginUserSchema.parse({
			email: "jane@example.com",
			password: "longenough",
		})
		expect(parsed.email).toBe("jane@example.com")
	})
})

describe("resetPasswordSchema", () => {
	it("requires only an email", () => {
		expect(() =>
			resetPasswordSchema.parse({ email: "jane@example.com" })
		).not.toThrow()
	})
})

describe("changePasswordSchema", () => {
	it("rejects when new password equals current", () => {
		expect(() =>
			changePasswordSchema.parse({
				current_password: "longenough",
				password: "longenough",
			})
		).toThrow()
	})

	it("accepts a new, different password", () => {
		expect(() =>
			changePasswordSchema.parse({
				current_password: "oldpassword1",
				password: "newpassword1",
			})
		).not.toThrow()
	})

	it("rejects mismatched confirmation", () => {
		expect(() =>
			changePasswordSchema.parse({
				current_password: "oldpassword1",
				password: "newpassword1",
				password_confirmation: "mismatch",
			})
		).toThrow()
	})
})

describe("confirmPasswordResetBodySchema", () => {
	it("rejects short password", () => {
		expect(() =>
			confirmPasswordResetBodySchema.parse({ password: "short" })
		).toThrow()
	})

	it("accepts valid password", () => {
		expect(() =>
			confirmPasswordResetBodySchema.parse({
				password: "longenoughpassword",
			})
		).not.toThrow()
	})
})

describe("confirmPasswordResetTokenSchema", () => {
	it("requires non-empty token", () => {
		expect(() =>
			confirmPasswordResetTokenSchema.parse({ token: "" })
		).toThrow()
	})

	it("accepts a token", () => {
		expect(() =>
			confirmPasswordResetTokenSchema.parse({ token: "abc" })
		).not.toThrow()
	})
})
