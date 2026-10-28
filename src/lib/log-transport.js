import build from "pino-abstract-transport"
import { once } from "node:events"
import pinoRoll from "pino-roll"

const LEVEL_LABEL = {
	10: "DEBUG",
	20: "DEBUG",
	30: "INFO",
	40: "WARNING",
	50: "ERROR",
	60: "CRITICAL",
}

const pad = (n) => String(n).padStart(2, "0")

const formatTime = (ms) => {
	const d = new Date(ms)
	return (
		`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
		`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
	)
}

const IGNORED_KEYS = new Set(["level", "time", "msg", "pid", "hostname", "v"])

const buildContext = (record) => {
	const context = {}
	for (const [key, value] of Object.entries(record)) {
		if (IGNORED_KEYS.has(key)) continue
		context[key] = value
	}
	return context
}

const formatError = (err) => {
	if (!err || typeof err !== "object") return null
	const stack = typeof err.stack === "string" ? err.stack : null
	return stack
}

export default async function (opts = {}) {
	const { appEnv = "production", destination } = opts

	let stream
	if (destination) {
		stream = await pinoRoll({
			file: destination,
			frequency: "daily",
			dateFormat: "yyyy-MM-dd",
			limit: { count: 6 },
			mkdir: true,
		})
	} else {
		stream = process.stdout
	}

	return build(
		async function (source) {
			for await (const record of source) {
				const level = LEVEL_LABEL[record.level] ?? "INFO"
				const time = formatTime(record.time ?? Date.now())
				const msg = record.msg ?? ""
				const context = buildContext(record)
				const errStack = formatError(context.err)
				if (errStack) delete context.err

				const ctxStr =
					Object.keys(context).length > 0
						? ` ${JSON.stringify(context)}`
						: ""

				stream.write(`[${time}] ${appEnv}.${level}: ${msg}${ctxStr}\n`)
				if (errStack) stream.write(`${errStack}\n`)
			}
		},
		{
			async close() {
				if (destination) {
					stream.end()
					await once(stream, "close")
				}
			},
		}
	)
}
