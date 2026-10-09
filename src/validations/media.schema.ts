import { ImageableType } from "@prisma/client"
import z from "zod"

export const ALLOWED_IMAGE_TYPES = [
	"image/jpeg",
	"image/jpg",
	"image/png",
	"image/webp",
	"image/gif",
	"image/bmp",
	"image/tiff",
	"image/svg+xml",
	"image/avif",
	"image/heic",
	"image/heif",
	"image/ico",
	"image/apng",
] as const

export const imageSchema = z.object({
	imageableType: z.enum(ImageableType),
	imageableId: z.cuid2(),
})

export const deleteImageSchema = z.object({
	id: z.cuid2(),
})
