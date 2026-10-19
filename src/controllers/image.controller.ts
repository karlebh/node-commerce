import fs from "fs/promises"
import path from "path"
import type { Request, Response } from "express"
import multer from "multer"
import { uploader, UPLOAD_DIR } from "../configs/multer.js"
import { prisma } from "../database/prisma.js"
import { deleteImageSchema, imageSchema } from "../validations/media.schema.js"
import { AppError } from "../errors/AppError.js"
import type { AuthenticatedHandler, AuthenticatedRequest } from "../middleware/protectedHandler.js"
import { isErrnoException, resolvePolymorphic } from "../helpers/index.js"

const singleUpload = uploader.single("file")

const runUpload = (request: Request, response: Response): Promise<void> =>
	new Promise((resolve, reject) => {
		singleUpload(request, response, (err: unknown) => {
			if (err instanceof multer.MulterError) {
				reject(new AppError(400, err.message))
				return
			}

			if (err) {
				reject(new AppError(500, "Upload failed"))
				return
			}

			resolve()
		})
	})

const removeFile = async (filePath: string): Promise<void> => {
	try {
		await fs.unlink(filePath)
	} catch (err: unknown) {
		if (!isErrnoException(err) || err.code !== "ENOENT") {
			throw err
		}
	}
}

export const store: AuthenticatedHandler = async (request: AuthenticatedRequest, response: Response) => {
	await runUpload(request, response)

	const file = request.file

	if (!file) throw new AppError(400, "No file uploaded")

	try {
		const body = imageSchema.parse(request.body)
		const url = `/storage/${file.filename}`

		const image = await prisma.$transaction(async (tx) => {
			const created = await tx.image.create({
				data: {
					url,
					imageableId: body.imageableId,
					imageableType: body.imageableType,
					userId: request.userId,
					size: file.size,
				},
			})

			const owner = await resolvePolymorphic(
				tx,
				created.imageableType,
				created.imageableId
			)

			return { ...created, owner }
		})

		response
			.status(201)
			.json({ message: "Image upload successful", data: { image } })
	} catch (err) {
		await removeFile(file.path).catch(() => undefined)
		throw err
	}
}

export const destroy: AuthenticatedHandler = async (request: AuthenticatedRequest, response: Response) => {
	const { id } = deleteImageSchema.parse(request.body)

	const image = await prisma.image.findFirst({
		where: { id, userId: request.userId },
	})

	if (!image) throw new AppError(404, "Image not found")

	await prisma.image.delete({ where: { id } })

	await removeFile(path.join(UPLOAD_DIR, path.basename(image.url)))

	response.status(200).json({ message: "Image deleted successfully" })
}
