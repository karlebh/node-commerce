import { type RequestHandler } from "express"
import { prisma } from "../database/prisma.js"
import { paginate } from "../lib/paginate.js"
import { AppError } from "../errors/AppError.js"
import {
	categoryParamsSchema,
	createCategorySchema,
} from "../validations/category.schema.js"
import { createSlug } from "../helpers/index.js"
import { urlQuerySchema } from "../validations/url-query.schema.js"

export const index: RequestHandler = async (request, response) => {
	const { page, perPage } = urlQuerySchema.parse(request.query)

	const [categories, total] = await Promise.all([
		prisma.category.findMany({
			skip: (page - 1) * perPage,
			take: perPage,
			orderBy: { createdAt: "desc" },
		}),
		prisma.category.count(),
	])

	return response.status(200).json(
		paginate({
			request,
			data: categories,
			total,
			page,
			perPage,
		})
	)
}

export const show: RequestHandler = async (request, response) => {
	const { id } = categoryParamsSchema.parse(request.params)
	if (typeof id !== "string") throw new AppError(404, "Not found")

	const category = await prisma.category.findUnique({ where: { id } })
	if (!category) throw new AppError(404, "Not found")

	return response.status(200).json({ data: { category } })
}

export const store: RequestHandler = async (request, response) => {
	const { name } = createCategorySchema.parse(request.body)
	const slug = createSlug(name)

	const category = await prisma.category.create({
		data: {
			name,
			slug,
		},
	})

	return response.status(201).json({ data: { category } })
}

export const update: RequestHandler = async (request, response) => {
	const { id } = categoryParamsSchema.parse(request.params)
	const { name } = createCategorySchema.parse(request.body)

	const category = await prisma.category.update({
		where: { id },
		data: { name },
	})

	return response.status(200).json({ data: { category } })
}

export const destroy: RequestHandler = async (request, response) => {
	const { id } = categoryParamsSchema.parse(request.params)

	const category = await prisma.category.findUnique({ where: { id } })

	if (!category) throw new AppError(404, "Not found")

	await prisma.category.delete({ where: { id } })

	return response.status(204).send()
}
