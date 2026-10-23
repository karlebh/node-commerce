import { describe, it, expect } from "vitest"
import { createCartSchema, destroyCartSchema } from "../../../src/validations/cart.schema.js"

const VALID_CUID2 = "clabcdefghij0123456789ab"

describe("createCartSchema", () => {
	it("accepts a valid cuid2 productId and defaults quantity to 1", () => {
		const parsed = createCartSchema.parse({ productId: VALID_CUID2 })
		expect(parsed.productId).toBe(VALID_CUID2)
		expect(parsed.quantity).toBe(1)
	})

	it("rejects an obviously non-cuid2 productId (uppercase chars)", () => {
		expect(() =>
			createCartSchema.parse({ productId: "NOT-A-VALID-CUID2!" })
		).toThrow()
	})

	it("rejects quantity below 1", () => {
		expect(() =>
			createCartSchema.parse({ productId: VALID_CUID2, quantity: 0 })
		).toThrow()
	})

	it("rejects quantity over 99", () => {
		expect(() =>
			createCartSchema.parse({ productId: VALID_CUID2, quantity: 100 })
		).toThrow()
	})
})

describe("destroyCartSchema", () => {
	it("rejects an obviously non-cuid2 id (special characters)", () => {
		expect(() => destroyCartSchema.parse({ id: "has spaces!" })).toThrow()
	})

	it("accepts a valid cuid2 id", () => {
		expect(() =>
			destroyCartSchema.parse({ id: VALID_CUID2 })
		).not.toThrow()
	})
})
