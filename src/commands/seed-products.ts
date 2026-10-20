import { faker } from "@faker-js/faker"
import type { CommandModule } from "yargs"
import { prisma } from "../database/prisma.js"

const PRODUCT_COUNT = 200
const CATEGORY_NAMES = [
	"Electronics",
	"Clothing",
	"Home & Kitchen",
	"Books",
	"Beauty",
	"Sports & Outdoors",
	"Toys & Games",
	"Health & Wellness",
	"Automotive",
	"Food & Grocery",
	"Jewelry",
	"Pet Supplies",
]

const slugify = (value: string): string =>
	value
		.toLowerCase()
		.trim()
		.replace(/&/g, "and")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")

export const seedProducts: CommandModule = {
	command: "seed-products",
	describe: "Seed product categories and 200 sample products",
	handler: async () => {
		try {
			const user = await prisma.user.findFirst({
				where: { deletedAt: null },
				orderBy: { createdAt: "asc" },
				select: { id: true },
			})

			if (!user) {
				throw new Error(
					"Cannot seed products: register a user before running this command."
				)
			}

			faker.seed(24681357)
			const seededProducts = Array.from({ length: PRODUCT_COUNT }, (_, index) => {
				const sequence = String(index + 1).padStart(3, "0")
				const name = faker.commerce.productName()
				const categoryName = CATEGORY_NAMES[index % CATEGORY_NAMES.length]

				if (!categoryName) {
					throw new Error(`No category configured for product ${sequence}.`)
				}

				return {
					name: `Product ${sequence} - ${name}`,
					slug: `seed-product-${sequence}-${slugify(name)}`,
					description: faker.commerce.productDescription(),
					price: faker.number.int({ min: 500, max: 250000 }),
					stock: faker.number.int({ min: 0, max: 100 }),
					userId: user.id,
					categoryName,
				}
			})

			const result = await prisma.$transaction(async (tx) => {
				const categories = await Promise.all(
					CATEGORY_NAMES.map((name) =>
						tx.category.upsert({
							where: { name },
							update: {},
							create: { name, slug: slugify(name) },
							select: { id: true, name: true },
						})
					)
				)
				const categoryIds = new Map(
					categories.map((category) => [category.name, category.id])
				)
				const products = seededProducts.map(({ categoryName, ...product }) => {
					const categoryId = categoryIds.get(categoryName)

					if (!categoryId) {
						throw new Error(`Category "${categoryName}" was not seeded.`)
					}

					return { ...product, categoryId }
				})

				return tx.product.createMany({
					data: products,
					skipDuplicates: true,
				})
			})

			console.log(
				`Seeded ${CATEGORY_NAMES.length} categories and inserted ${result.count} of ${PRODUCT_COUNT} sample products.`
			)
		} finally {
			await prisma.$disconnect()
		}
	},
}
