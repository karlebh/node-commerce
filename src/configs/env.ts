import "dotenv/config"
import { z } from "zod"

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "test", "production"])
		.default("development"),
	PORT: z.coerce.number().int().positive().default(3000),
	DATABASE_URL: z.string().default("file:./dev.db"),
	JWT_SECRET: z
		.string()
		.min(32)
		.default("development-only-secret-change-me-123456"),
	FRONTEND_URL: z.string().url().default("http://localhost:5173"),
})

export const env = envSchema.parse(process.env)
