import { describe, it, expect } from "vitest"
import {
	applyDiscountSchema,
	createDiscountSchema,
	discountParamsSchema,
	updateDiscountSchema,
} from "../../../src/validations/discount.schema.js"

const VALID_UUID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"

describe("createDiscountSchema", () => {
	it("accepts a minimal percentage discount", () => {
		const parsed = createDiscountSchema.parse({
			code: "SAVE10",
			type: "PERCENTAGE",
			value: 10,
		})
		expect(parsed.code).toBe("SAVE10")
		expect(parsed.isActive).toBe(true)
	})

	it("accepts a fixed amount discount", () => {
		const parsed = createDiscountSchema.parse({
			code: "FLAT_500",
			type: "FIXED_AMOUNT",
			value: 500,
		})
		expect(parsed.type).toBe("FIXED_AMOUNT")
	})

	it("rejects a percentage above 100", () => {
		expect(() =>
			createDiscountSchema.parse({
				code: "SAVE200",
				type: "PERCENTAGE",
				value: 200,
			})
		).toThrow(/between 1 and 100/)
	})

	it("rejects codes with invalid characters", () => {
		expect(() =>
			createDiscountSchema.parse({
				code: "save!",
				type: "PERCENTAGE",
				value: 5,
			})
		).toThrow()
	})

	it("normalizes mixed-case codes to uppercase", () => {
		const parsed = createDiscountSchema.parse({
			code: "save10",
			type: "PERCENTAGE",
			value: 10,
		})
		expect(parsed.code).toBe("SAVE10")
	})

	it("rejects codes that are too short", () => {
		expect(() =>
			createDiscountSchema.parse({
				code: "AB",
				type: "PERCENTAGE",
				value: 5,
			})
		).toThrow()
	})

	it("rejects when expiresAt is not after startsAt", () => {
		expect(() =>
			createDiscountSchema.parse({
				code: "WINDOW",
				type: "PERCENTAGE",
				value: 5,
				startsAt: new Date("2026-12-01"),
				expiresAt: new Date("2026-12-01"),
			})
		).toThrow(/expiresAt must be after/)
	})

	it("rejects a non-positive value", () => {
		expect(() =>
			createDiscountSchema.parse({
				code: "ZERO",
				type: "FIXED_AMOUNT",
				value: 0,
			})
		).toThrow()
	})
})

describe("updateDiscountSchema", () => {
	it("accepts partial updates", () => {
		const parsed = updateDiscountSchema.parse({ isActive: false })
		expect(parsed.isActive).toBe(false)
	})

	it("allows nullable usageLimit", () => {
		const parsed = updateDiscountSchema.parse({ usageLimit: null })
		expect(parsed.usageLimit).toBeNull()
	})

	it("still enforces the percentage ceiling when value provided", () => {
		expect(() =>
			updateDiscountSchema.parse({ type: "PERCENTAGE", value: 150 })
		).toThrow()
	})
})

describe("discountParamsSchema", () => {
	it("accepts a valid uuid id", () => {
		expect(() =>
			discountParamsSchema.parse({ id: VALID_UUID })
		).not.toThrow()
	})

	it("rejects a non-uuid id", () => {
		expect(() => discountParamsSchema.parse({ id: "nope" })).toThrow()
	})
})

describe("applyDiscountSchema", () => {
	it("accepts a valid code", () => {
		expect(() => applyDiscountSchema.parse({ code: "SAVE10" })).not.toThrow()
	})

	it("rejects an empty code", () => {
		expect(() => applyDiscountSchema.parse({ code: "" })).toThrow()
	})
})
