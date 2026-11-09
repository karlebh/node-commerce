import type { Response } from "express"
import { Prisma } from "@prisma/client"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import { paginate } from "../lib/paginate.js"
import type {
	AuthenticatedHandler,
	AuthenticatedRequest,
} from "../middleware/protectedHandler.js"
import {
	applyDiscountSchema,
	createDiscountSchema,
	discountParamsSchema,
	updateDiscountSchema,
} from "../validations/discount.schema.js"
import { urlQuerySchema } from "../validations/url-query.schema.js"
import { resolveDiscountForSubtotal } from "../services/discount.service.js"

export const index: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { page, perPage, search } = urlQuerySchema.parse(request.query)

	const where: Prisma.DiscountWhereInput = {
		userId: request.userId,
		deletedAt: null,
		...(search ? { code: { contains: search, mode: "insensitive" } } : {}),
	}

	const [discounts, total] = await Promise.all([
		prisma.discount.findMany({
			where,
			skip: (page - 1) * perPage,
			take: perPage,
			orderBy: { createdAt: "desc" },
		}),
		prisma.discount.count({ where }),
	])

	return response.status(200).json(
		paginate({
			request,
			data: discounts,
			total,
			page,
			perPage,
		})
	)
}

export const show: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { id } = discountParamsSchema.parse(request.params)

	const discount = await prisma.discount.findUnique({ where: { id } })

	if (!discount || discount.deletedAt || discount.userId !== request.userId) {
		throw new AppError(404, "Discount not found")
	}

	return response.status(200).json({ data: { discount } })
}

export const store: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const input = createDiscountSchema.parse(request.body)

	try {
		const discount = await prisma.discount.create({
			data: {
				...input,
				user: { connect: { id: request.userId } },
			},
		})
		return response.status(201).json({ data: { discount } })
	} catch (error) {
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === "P2002"
		) {
			throw new AppError(409, "A discount with this code already exists")
		}
		throw error
	}
}

export const update: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { id } = discountParamsSchema.parse(request.params)
	const input = updateDiscountSchema.parse(request.body)

	const data: Prisma.DiscountUpdateInput = Object.fromEntries(
		Object.entries(input).filter(([, value]) => value !== undefined)
	)

	try {
		const discount = await prisma.discount.update({
			where: { id },
			data,
		})
		return response.status(200).json({ data: { discount } })
	} catch (error) {
		if (error instanceof Prisma.PrismaClientKnownRequestError) {
			if (error.code === "P2002") {
				throw new AppError(409, "A discount with this code already exists")
			}
			if (error.code === "P2025") {
				throw new AppError(404, "Discount not found")
			}
		}
		throw error
	}
}

export const destroy: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { id } = discountParamsSchema.parse(request.params)

	await prisma.discount.delete({ where: { id } })

	return response.status(204).send()
}

export const apply: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { code } = applyDiscountSchema.parse(request.body)

	const cart = await prisma.cart.findUnique({
		where: { userId: request.userId },
		include: {
			items: {
				where: { deletedAt: null },
				include: {
					product: {
						select: {
							price: true,
							isActive: true,
							deletedAt: true,
						},
					},
				},
			},
		},
	})

	if (!cart || cart.items.length === 0) {
		throw new AppError(422, "Cart is empty")
	}

	const subtotal = cart.items.reduce((sum, item) => {
		if (
			!item.product ||
			!item.product.isActive ||
			item.product.deletedAt !== null
		) {
			return sum
		}
		return sum + item.product.price * item.quantity
	}, 0)

	const result = await resolveDiscountForSubtotal(code, subtotal)

	return response.status(200).json({
		data: {
			code: result.discount.code,
			type: result.discount.type,
			subtotal: result.subtotal,
			discountAmount: result.discountAmount,
			total: result.total,
		},
	})
}
