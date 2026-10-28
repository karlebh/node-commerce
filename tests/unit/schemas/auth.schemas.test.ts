import { beforeEach, describe, it, expect, vi } from "vitest"

const { mockFindFirst } = vi.hoisted(() => ({
	mockFindFirst: vi.fn(),
}))

vi.mock("../../../src/database/prisma.js", () => ({
	prisma: { user: { findFirst: mockFindFirst } },
}))

import {
	registerUserSchema,
	loginUserSchema,
	resetPasswordSchema,
	changePasswordSchema,
	confirmPasswordResetBodySchema,
	confirmPasswordResetTokenSchema,
} from "../../../src/validations/auth.schemas.js"

describe("registerUserSchema", () => {
	beforeEach(() => {
		mockFindFirst.mockReset().mockResolvedValue(null)
	})

	it("accepts valid payload without confirmation", async () => {
		const parsed = await registerUserSchema.parseAsync({
			username: "jane",
			email: "JANE@example.com",
			password: "longenoughpassword",
		})
		expect(parsed.email).toBe("jane@example.com")
		expect(mockFindFirst).toHaveBeenCalledWith({
			where: { OR: [{ email: "jane@example.com" }, { username: "jane" }] },
			select: { email: true, username: true },
		})
	})

	it("accepts matching snake_case confirmation", async () => {
		await expect(
			registerUserSchema.parseAsync({
				username: "jane",
				email: "jane@example.com",
				password: "longenough",
				password_confirmation: "longenough",
			})
		).resolves.toMatchObject({ username: "jane" })
	})

	it("accepts matching camelCase confirmation", async () => {
		await expect(
			registerUserSchema.parseAsync({
				username: "jane",
				email: "jane@example.com",
				password: "longenough",
				passwordConfirmation: "longenough",
			})
		).resolves.toMatchObject({ username: "jane" })
	})

	it("rejects mismatched confirmation", async () => {
		await expect(
			registerUserSchema.parseAsync({
				username: "jane",
				email: "jane@example.com",
				password: "longenough",
				password_confirmation: "different",
			})
		).rejects.toThrow()
	})

	it("rejects short username", async () => {
		await expect(
			registerUserSchema.parseAsync({
				username: "a",
				email: "jane@example.com",
				password: "longenough",
			})
		).rejects.toThrow()
	})

	it("rejects short password", async () => {
		await expect(
			registerUserSchema.parseAsync({
				username: "jane",
				email: "jane@example.com",
				password: "short",
			})
		).rejects.toThrow()
	})

	it("rejects an email already in use", async () => {
		mockFindFirst.mockResolvedValue({
			email: "jane@example.com",
			username: "someone-else",
		})

		await expect(
			registerUserSchema.parseAsync({
				username: "jane",
				email: "jane@example.com",
				password: "longenough",
			})
		).rejects.toMatchObject({
			issues: [expect.objectContaining({ path: ["email"] })],
		})
	})

	it("rejects a username already in use", async () => {
		mockFindFirst.mockResolvedValue({
			email: "someone@example.com",
			username: "jane",
		})

		await expect(
			registerUserSchema.parseAsync({
				username: "jane",
				email: "jane@example.com",
				password: "longenough",
			})
		).rejects.toMatchObject({
			issues: [expect.objectContaining({ path: ["username"] })],
		})
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
