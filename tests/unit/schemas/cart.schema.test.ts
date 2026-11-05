import { describe, it, expect } from "vitest"
import { createCartSchema, destroyCartSchema } from "../../../src/validations/cart.schema.js"

const VALID_UUID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"

describe("createCartSchema", () => {
	it("accepts a valid uuid productId and defaults quantity to 1", () => {
		const parsed = createCartSchema.parse({ productId: VALID_UUID })
		expect(parsed.productId).toBe(VALID_UUID)
		expect(parsed.quantity).toBe(1)
	})

	it("rejects an obviously non-uuid productId", () => {
		expect(() =>
			createCartSchema.parse({ productId: "NOT-A-VALID-UUID!" })
		).toThrow()
	})

	it("rejects quantity below 1", () => {
		expect(() =>
			createCartSchema.parse({ productId: VALID_UUID, quantity: 0 })
		).toThrow()
	})

	it("rejects quantity over 99", () => {
		expect(() =>
			createCartSchema.parse({ productId: VALID_UUID, quantity: 100 })
		).toThrow()
	})
})

describe("destroyCartSchema", () => {
	it("rejects an obviously non-uuid id (special characters)", () => {
		expect(() => destroyCartSchema.parse({ id: "has spaces!" })).toThrow()
	})

	it("accepts a valid uuid id", () => {
		expect(() =>
			destroyCartSchema.parse({ id: VALID_UUID })
		).not.toThrow()
	})
})
