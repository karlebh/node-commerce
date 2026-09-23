import type { RequestHandler } from "express"
import type { Prisma } from "@prisma/client"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import {
	createProductSchema,
	updateProductSchema,
} from "../validations/product.schemas.js"
import { urlQuerySchema } from "../validations/url-query.schema.js"
import { paginate } from "../lib/paginate.js"

export const index: RequestHandler = async (request, response) => {
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

export const show: RequestHandler = async (request, response) => {
	const slug = request.params.slug

	if (typeof slug !== "string") throw new AppError(404, "Product not found")

	const product = await prisma.product.findUnique({ where: { slug } })

	if (!product || !product.isActive)
		throw new AppError(404, "Product not found")

	response.json({ data: product })
}

export const store: RequestHandler = async (request, response) => {
	const { imageUrl, categoryId, ...productFields } =
		createProductSchema.parse(request.body)
	const userId = `848478-hfhfhf`

	const data: Prisma.ProductCreateInput = {
		...productFields,
		...(imageUrl !== undefined && { imageUrl }),
		user: { connect: { id: userId } },
		category: { connect: { id: categoryId } },
	}

	const product = await prisma.product.create({ data })
	response.status(201).json({ data: product })
}

export const update: RequestHandler = async (request, response) => {
	const input = updateProductSchema.parse(request.body)

	const id = request.params.id
	if (typeof id !== "string") throw new AppError(404, "Product not found")

	const data = Object.fromEntries(
		Object.entries(input).filter(([, value]) => value !== undefined)
	) as Prisma.ProductUpdateInput

	const product = await prisma.product.update({ where: { id }, data })
	response.status(200).json({ data: product })
}

export const destroy: RequestHandler = async (request, response) => {
	const id = request.params.id

	if (typeof id !== "string") throw new AppError(404, "Product not found")

	await prisma.product.update({
		where: { id },
		data: { isActive: false },
	})

	response.status(204).send()
}
