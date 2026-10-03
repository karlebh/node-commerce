import pino from "pino"
import path from "node:path"

const logDir = path.join(process.cwd(), "logs")

const prettyOptions = {
	translateTime: "dd/mm/yyyy HH:MM:ss",
	messageFormat: "{msg}",
	ignore: "pid,hostname",
}

export const logger = pino(
	{
		level: "info",
		base: null,
		timestamp: pino.stdTimeFunctions.isoTime,
	},
	pino.transport({
		targets: [
			{
				target: "pino-pretty",
				level: "info",
				options: {
					...prettyOptions,
					colorize: true,
				},
			},
			{
				target: "pino-pretty",
				level: "info",
				options: {
					...prettyOptions,
					colorize: false,
					destination: path.join(logDir, "app.log"),
					mkdir: true,
				},
			},
		],
	})
)
