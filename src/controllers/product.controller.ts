import type { RequestHandler } from "express"
import type { Prisma } from "@prisma/client"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import {
	createProductSchema,
	updateProductSchema,
} from "../models/product.schemas.js"

export const index: RequestHandler = async (request, response) => {
	const page = Math.max(Number(request.query.page) || 1, 1)
	const perPage = Math.min(
		Math.max(Number(request.query.perPage) || 12, 1),
		50
	)
	const search =
		typeof request.query.search === "string"
			? request.query.search
			: undefined
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
	response.json({
		data: products,
		meta: { page, perPage, total, lastPage: Math.ceil(total / perPage) },
	})
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
	const input = createProductSchema.parse(request.body)

	const { imageUrl, ...productFields } = input
	const data: Prisma.ProductCreateInput =
		imageUrl === undefined ? productFields : { ...productFields, imageUrl }
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
	try {
		const product = await prisma.product.update({ where: { id }, data })
		response.json({ data: product })
	} catch {
		throw new AppError(404, "Product not found")
	}
}

export const destroy: RequestHandler = async (request, response) => {
	const id = request.params.id
	if (typeof id !== "string") throw new AppError(404, "Product not found")
	try {
		await prisma.product.update({
			where: { id },
			data: { isActive: false },
		})
		response.status(204).send()
	} catch {
		throw new AppError(404, "Product not found")
	}
}
