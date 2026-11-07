import fs from "fs/promises"
import path from "path"
import type { Request, Response } from "express"
import multer from "multer"
import { videoUploader, UPLOAD_DIR } from "../configs/multer.js"
import { prisma } from "../database/prisma.js"
import { deleteVideoSchema, videoSchema } from "../validations/media.schema.js"
import { AppError } from "../errors/AppError.js"
import type {
	AuthenticatedHandler,
	AuthenticatedRequest,
} from "../middleware/protectedHandler.js"
import { isErrnoException, resolvePolymorphic } from "../helpers/index.js"

const singleUpload = videoUploader.single("file")

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
		if (!isErrnoException(err) || err.code !== "ENOENT") throw err
	}
}

export const store: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	await runUpload(request, response)

	const file = request.file
	if (!file) throw new AppError(400, "No file uploaded")

	try {
		const body = videoSchema.parse(request.body)
		const url = `/storage/${file.filename}`

		const video = await prisma.$transaction(async (tx) => {
			const owner = await resolvePolymorphic(
				tx,
				body.videoableType,
				body.videoableId
			)
			if (!owner) {
				throw new AppError(404, "Target resource not found")
			}

			return tx.video.create({
				data: {
					url,
					mimeType: file.mimetype,
					...(body.durationMs !== undefined && {
						durationMs: body.durationMs,
					}),
					videoableId: body.videoableId,
					videoableType: body.videoableType,
					userId: request.userId,
					size: file.size,
				},
			})
		})

		return response.status(201).json({ data: { video } })
	} catch (err) {
		await removeFile(file.path).catch(() => undefined)
		throw err
	}
}

export const destroy: AuthenticatedHandler = async (
	request: AuthenticatedRequest,
	response: Response
): Promise<Response> => {
	const { id } = deleteVideoSchema.parse(request.params)

	const video = await prisma.video.findFirst({
		where: { id, userId: request.userId },
	})
	if (!video) throw new AppError(404, "Video not found")

	await prisma.video.delete({ where: { id } })
	await removeFile(path.join(UPLOAD_DIR, path.basename(video.url)))

	return response.status(204).send()
}
