import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockPrisma } = vi.hoisted(() => ({
	mockPrisma: {
		discount: { findUnique: vi.fn() },
	},
}))

vi.mock("../../../src/database/prisma.js", () => ({ prisma: mockPrisma }))

const { calculateDiscountAmount, resolveDiscountForSubtotal } = await import(
	"../../../src/services/discount.service.js"
)

const makeDiscount = (overrides: Record<string, unknown> = {}) => ({
	id: "d1",
	code: "SAVE10",
	description: null,
	type: "PERCENTAGE",
	value: 10,
	minOrderAmount: null,
	maxDiscountAmount: null,
	usageLimit: null,
	usedCount: 0,
	startsAt: null,
	expiresAt: null,
	isActive: true,
	userId: "u1",
	createdAt: new Date(),
	updatedAt: new Date(),
	deletedAt: null,
	...overrides,
})

describe("calculateDiscountAmount", () => {
	it("computes percentage discount floored", () => {
		expect(
			calculateDiscountAmount(
				{ type: "PERCENTAGE", value: 15, maxDiscountAmount: null },
				999
			)
		).toBe(149)
	})

	it("returns the fixed amount for FIXED_AMOUNT", () => {
		expect(
			calculateDiscountAmount(
				{ type: "FIXED_AMOUNT", value: 500, maxDiscountAmount: null },
				1000
			)
		).toBe(500)
	})

	it("caps percentage at maxDiscountAmount", () => {
		expect(
			calculateDiscountAmount(
				{ type: "PERCENTAGE", value: 50, maxDiscountAmount: 100 },
				1000
			)
		).toBe(100)
	})

	it("never exceeds subtotal", () => {
		expect(
			calculateDiscountAmount(
				{ type: "FIXED_AMOUNT", value: 500, maxDiscountAmount: null },
				300
			)
		).toBe(300)
	})
})

describe("resolveDiscountForSubtotal", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("throws 404 when the code does not exist", async () => {
		mockPrisma.discount.findUnique.mockResolvedValue(null)
		await expect(resolveDiscountForSubtotal("GONE", 100)).rejects.toThrow(
			/not found/i
		)
	})

	it("throws 404 when the discount is soft-deleted", async () => {
		mockPrisma.discount.findUnique.mockResolvedValue(
			makeDiscount({ deletedAt: new Date() })
		)
		await expect(resolveDiscountForSubtotal("DELETED", 100)).rejects.toThrow(
			/not found/i
		)
	})

	it("rejects an inactive discount", async () => {
		mockPrisma.discount.findUnique.mockResolvedValue(
			makeDiscount({ isActive: false })
		)
		await expect(resolveDiscountForSubtotal("OFF", 100)).rejects.toThrow(
			/inactive/i
		)
	})

	it("rejects a discount before its start window", async () => {
		mockPrisma.discount.findUnique.mockResolvedValue(
			makeDiscount({ startsAt: new Date("2030-01-01") })
		)
		await expect(
			resolveDiscountForSubtotal("EARLY", 100, new Date("2026-01-01"))
		).rejects.toThrow(/not yet active/i)
	})

	it("rejects an expired discount", async () => {
		mockPrisma.discount.findUnique.mockResolvedValue(
			makeDiscount({ expiresAt: new Date("2020-01-01") })
		)
		await expect(
			resolveDiscountForSubtotal("DONE", 100, new Date("2026-01-01"))
		).rejects.toThrow(/expired/i)
	})

	it("rejects when usage limit reached", async () => {
		mockPrisma.discount.findUnique.mockResolvedValue(
			makeDiscount({ usageLimit: 5, usedCount: 5 })
		)
		await expect(resolveDiscountForSubtotal("USED", 100)).rejects.toThrow(
			/usage limit/i
		)
	})

	it("rejects when subtotal is below minOrderAmount", async () => {
		mockPrisma.discount.findUnique.mockResolvedValue(
			makeDiscount({ minOrderAmount: 500 })
		)
		await expect(resolveDiscountForSubtotal("MIN", 100)).rejects.toThrow(
			/minimum/i
		)
	})

	it("returns subtotal, discountAmount and total on success", async () => {
		mockPrisma.discount.findUnique.mockResolvedValue(
			makeDiscount({ type: "PERCENTAGE", value: 20 })
		)
		const result = await resolveDiscountForSubtotal("SAVE20", 1000)
		expect(result.subtotal).toBe(1000)
		expect(result.discountAmount).toBe(200)
		expect(result.total).toBe(800)
	})
})
