import "dotenv/config"
import { z } from "zod"
import type { StringValue } from "ms"

const msString = z
	.string()
	.regex(
		/^\d+(\.\d+)?\s*(ms|s|m|h|d|w|y)?$/i,
		"must be a valid ms duration, e.g. '15m', '1h', '7d'"
	)
	.transform((v) => v as StringValue)

const boolString = z.enum(["true", "false"]).transform((v) => v === "true")

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "test", "staging", "production"])
		.default("development"),
	PORT: z.coerce.number().int().positive().default(3000),
	DATABASE_URL: z.string().default("file:./dev.db"),
	JWT_SECRET: z
		.string()
		.min(32)
		.default("development-only-secret-change-me-123456"),
	JWT_EXPIRES_IN: msString.default("15m" as StringValue),
	SESSION_TTL_MS: z.coerce.number().int().positive().default(604800000),
	IDEMPOTENCY_TTL_MS: z.coerce.number().int().positive().default(86400000),
	FRONTEND_URL: z.string().url().default("http://localhost:5173"),
	APP_URL: z.string().url().optional(),
	APP_NAME: z.string(),
	MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().default(50),
	OAUTH_SESSION: boolString.default(false),
	PAYSTACK_SECRET_KEY: z.string().min(1).optional(),
	FLUTTERWAVE_SECRET_KEY: z.string().min(1).optional(),
	FLUTTERWAVE_WEBHOOK_HASH: z.string().min(1).optional(),
	PAYMENT_CALLBACK_URL: z
		.string()
		.url()
		.default("http://localhost:5173/payments/callback"),
})

export const env = envSchema.parse(process.env)
