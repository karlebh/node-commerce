import type { Request, RequestHandler, Response } from "express"
import type { Prisma } from "@prisma/client"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import {
	createProductSchema,
	productParamSchema,
	updateProductSchema,
} from "../validations/product.schemas.js"
import { urlQuerySchema } from "../validations/url-query.schema.js"
import { paginate } from "../lib/paginate.js"
import type { AuthenticatedHandler, AuthenticatedRequest } from "../middleware/protectedHandler.js"
import { createSlug } from "../helpers/index.js"

export const index: RequestHandler = async (request: Request, response: Response) => {
	const { page, perPage, search } = urlQuerySchema.parse(request.query)

	const where = {
		isActive: true,
		...(search ? { name: { contains: search } } : {}),
	}

	const [products, total] = await Promise.all([
		prisma.product.findMany({
			where,
			skip: (page - 1) * perPage,
			take: perPage,
			orderBy: { createdAt: "desc" },
		}),
		prisma.product.count({ where }),
	])

	return response.status(200).json(
		paginate({
			request,
			data: products,
			total,
			page,
			perPage,
		})
	)
}

export const show: RequestHandler = async (request: Request, response: Response) => {
	const { id } = productParamSchema.parse(request.params)

	const product = await prisma.product.findUnique({ where: { id } })

	if (!product || !product.isActive)
		throw new AppError(404, "Product not found")

	response.json({ data: product })
}

export const store: AuthenticatedHandler = async (request: AuthenticatedRequest, response: Response) => {
	const { imageUrl, categoryId, ...productFields } =
		createProductSchema.parse(request.body)

	const category = await prisma.category.findUnique({
		where: { id: categoryId },
		select: { id: true },
	})

	if (!category) throw new AppError(404, "Category not found")

	const userId = request.userId

	const data: Prisma.ProductCreateInput = {
		...productFields,
		...(imageUrl !== undefined && { imageUrl }),
		slug: createSlug(productFields.name),
		user: { connect: { id: userId } },
		category: { connect: { id: categoryId } },
	}

	const product = await prisma.product.create({ data })
	response.status(201).json({ data: product })
}

export const update: RequestHandler = async (request: Request, response: Response) => {
	const input = updateProductSchema.parse(request.body)
	const { id } = productParamSchema.parse(request.params)

	const data = Object.fromEntries(
		Object.entries(input).filter(([, value]) => value !== undefined)
	) as Prisma.ProductUpdateInput

	if (typeof data.name === "string") {
		data.slug = createSlug(data.name)
	}

	const product = await prisma.product.update({
		where: { id },
		data,
	})

	response.status(200).json({ data: product })
}

export const destroy: RequestHandler = async (request: Request, response: Response) => {
	const { id } = productParamSchema.parse(request.params)

	await prisma.product.delete({
		where: { id },
	})

	response.status(200).json({ message: "Product deleted succesfully" })
}
