import multer from "multer"
import path from "path"
import fs from "fs"
import { ALLOWED_IMAGE_TYPES } from "../validations/media.schema.js"

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR as string)
const MAX_UPLOAD_SIZE_MB = Number(process.env.MAX_UPLOAD_SIZE_MB) || 50

const DOC_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"]

const ALLOWED_MIME_TYPES = [...ALLOWED_IMAGE_TYPES, ...DOC_MIMES] as const

fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
	destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
	filename: (_req, file, cb) => {
		const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
		const ext = path.extname(file.originalname)
		const base = path
			.basename(file.originalname, ext)
			.replace(/[^a-zA-Z0-9_-]/g, "_")
		cb(null, `${base}-${unique}${ext}`)
	},
})

export const uploader = multer({
	storage,
	limits: { fileSize: MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
	fileFilter: (_req, file, cb) => {
		if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
			cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname))
			return
		}
		cb(null, true)
	},
})
