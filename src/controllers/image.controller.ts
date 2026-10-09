import fs from "fs/promises"
import path from "path"
import type { RequestHandler } from "express"
import multer from "multer"
import { uploader, UPLOAD_DIR } from "../configs/multer.js"
import { prisma } from "../database/prisma.js"
import { deleteImageSchema, imageSchema } from "../validations/media.schema.js"
import { AppError } from "../errors/AppError.js"
import type { AuthenticatedHandler } from "../middleware/protectedHandler.js"

const singleUpload = uploader.single("file")

export const store: AuthenticatedHandler = (request, response) => {
	singleUpload(request, response, async (err: unknown) => {
		if (err instanceof multer.MulterError) {
			response.status(400).json({ error: err.message })
			return
		}

		if (err) {
			response.status(500).json({ error: "Upload failed" })
			return
		}

		if (!request.file) {
			response.status(400).json({ error: "No file uploaded" })
			return
		}

		const file = request.file
		const url = `/storage/${file.filename}`

		imageSchema.parse(request.body)

		const image = await prisma.$transaction(async (tx) => {
			const created = await tx.image.create({
				data: {
					url,
					imageableId: request.body.imageableId,
					imageableType: request.body.imageableType,
					userId: request.userId,
					size: file.size,
				},
			})

			const owner = await resolveImageable(
				tx,
				created.imageableType,
				created.imageableId
			)

			return { ...created, owner }
		})

		response
			.status(201)
			.json({ message: "Image upload successful", data: { image } })
	})
}

export const destroy: RequestHandler = async (request, response) => {
	const { id } = deleteImageSchema.parse(request.body)

	const image = await prisma.$transaction(async (tx) => {
		const fetched = await tx.image.findUniqueOrThrow({ where: { id } })

		const owner = await resolveImageable(
			tx,
			fetched.imageableType,
			fetched.imageableId
		)

		return { ...fetched, owner }
	})

	if (!image) throw new AppError(404, "Image not found")

	const filePath = path.join(UPLOAD_DIR, path.basename(image.url))

	try {
		await fs.unlink(filePath)
	} catch (err: unknown) {
		if (!isErrnoException(err) || err.code !== "ENOENT") {
			throw err
		}
	}

	await prisma.image.delete({ where: { id } })

	response.status(200).json({ message: "Image deleted successfully" })
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

const imageableResolvers = {
	User: (tx: Tx, id: string) => tx.user.findUnique({ where: { id } }),
	Category: (tx: Tx, id: string) => tx.category.findUnique({ where: { id } }),
	Product: (tx: Tx, id: string) => tx.product.findUnique({ where: { id } }),
} as const

export async function resolveImageable(
	tx: Tx,
	imageableType: string,
	imageableId: string
) {
	const resolver =
		imageableResolvers[imageableType as keyof typeof imageableResolvers]
	if (!resolver) return null
	return resolver(tx, imageableId)
}

const isErrnoException = (err: unknown): err is NodeJS.ErrnoException =>
	err instanceof Error && "code" in err
