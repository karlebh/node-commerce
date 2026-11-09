import type { Discount } from "@prisma/client"
import { AppError } from "../errors/AppError.js"
import { prisma } from "../database/prisma.js"

export type DiscountCalculation = {
	discount: Discount
	subtotal: number
	discountAmount: number
	total: number
}

export const calculateDiscountAmount = (
	discount: Pick<Discount, "type" | "value" | "maxDiscountAmount">,
	subtotal: number
): number => {
	const raw =
		discount.type === "PERCENTAGE"
			? Math.floor((subtotal * discount.value) / 100)
			: discount.value

	const capped =
		discount.maxDiscountAmount !== null &&
		discount.maxDiscountAmount !== undefined
			? Math.min(raw, discount.maxDiscountAmount)
			: raw

	return Math.min(capped, subtotal)
}

export const resolveDiscountForSubtotal = async (
	code: string,
	subtotal: number,
	now: Date = new Date()
): Promise<DiscountCalculation> => {
	const discount = await prisma.discount.findUnique({ where: { code } })

	if (!discount || discount.deletedAt) {
		throw new AppError(404, "Discount code not found")
	}

	if (!discount.isActive) {
		throw new AppError(422, "Discount code is inactive")
	}

	if (discount.startsAt && discount.startsAt > now) {
		throw new AppError(422, "Discount code is not yet active")
	}

	if (discount.expiresAt && discount.expiresAt <= now) {
		throw new AppError(422, "Discount code has expired")
	}

	if (
		discount.usageLimit !== null &&
		discount.usedCount >= discount.usageLimit
	) {
		throw new AppError(422, "Discount code usage limit reached")
	}

	if (
		discount.minOrderAmount !== null &&
		subtotal < discount.minOrderAmount
	) {
		throw new AppError(422, "Order does not meet discount minimum", {
			minOrderAmount: discount.minOrderAmount,
			subtotal,
		})
	}

	const discountAmount = calculateDiscountAmount(discount, subtotal)

	return {
		discount,
		subtotal,
		discountAmount,
		total: subtotal - discountAmount,
	}
}
