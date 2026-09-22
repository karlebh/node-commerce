import pino from "pino"
import { file } from "zod"

export const logger = pino(
	{
		level: "info",
	},

	pino.transport({
		target: "pino-roll",
		options: {
			file: "./logs/app",
			frequncy: "daily",
			makdir: true,
			limit: { count: 10 },
		},
	})
)
