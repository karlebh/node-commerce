import pino from "pino"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { env } from "../configs/env.js"

const transportPath = fileURLToPath(
	new URL("./log-transport.js", import.meta.url)
)
const logDir = path.join(process.cwd(), "logs")

export const logger = pino(
	{
		level: "info",
		base: null,
		timestamp: pino.stdTimeFunctions.epochTime,
	},
	pino.transport({
		targets: [
			{
				target: transportPath,
				level: "info",
				options: { appEnv: env.NODE_ENV },
			},
			{
				target: transportPath,
				level: "info",
				options: {
					appEnv: env.NODE_ENV,
					destination: path.join(logDir, "app.log"),
				},
			},
		],
	})
)
