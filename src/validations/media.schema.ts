import { ImageableType, VideoableType } from "@prisma/client"
import { z } from "zod"

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

export const ALLOWED_VIDEO_TYPES = [
	"video/mp4",
	"video/webm",
	"video/quicktime",
	"video/x-matroska",
	"video/ogg",
] as const

export const imageSchema = z.object({
	imageableType: z.enum(ImageableType),
	imageableId: z.uuid(),
})

export const deleteImageSchema = z.object({
	id: z.uuid(),
})

export const videoSchema = z.object({
	videoableType: z.enum(VideoableType),
	videoableId: z.uuid(),
	durationMs: z.coerce.number().int().positive().optional(),
})

export const deleteVideoSchema = z.object({
	id: z.uuid(),
})
