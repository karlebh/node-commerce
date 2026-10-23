import { describe, it, expect } from "vitest"
import {
	createProductSchema,
	updateProductSchema,
} from "../../../src/validations/product.schemas.js"

describe("createProductSchema", () => {
	it("accepts valid payload", () => {
		const parsed = createProductSchema.parse({
			name: "Widget",
			description: "A fine widget indeed",
			price: 1000,
			stock: 5,
			categoryId: "cat1",
		})
		expect(parsed.stock).toBe(5)
	})

	it("defaults stock to 0", () => {
		const parsed = createProductSchema.parse({
			name: "Widget",
			description: "A fine widget indeed",
			price: 1000,
			categoryId: "cat1",
		})
		expect(parsed.stock).toBe(0)
	})

	it("rejects negative price", () => {
		expect(() =>
			createProductSchema.parse({
				name: "Widget",
				description: "A fine widget indeed",
				price: -1,
				categoryId: "cat1",
			})
		).toThrow()
	})

	it("rejects name under 2 characters", () => {
		expect(() =>
			createProductSchema.parse({
				name: "a",
				description: "A fine widget indeed",
				price: 1,
				categoryId: "cat1",
			})
		).toThrow()
	})

	it("rejects description shorter than 10 characters", () => {
		expect(() =>
			createProductSchema.parse({
				name: "Widget",
				description: "short",
				price: 1,
				categoryId: "cat1",
			})
		).toThrow()
	})
})

describe("updateProductSchema", () => {
	it("accepts an empty object (every field optional)", () => {
		expect(() => updateProductSchema.parse({})).not.toThrow()
	})

	it("accepts partial updates", () => {
		const parsed = updateProductSchema.parse({ price: 42 })
		expect(parsed.price).toBe(42)
	})
})
