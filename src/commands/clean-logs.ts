import type { CommandModule } from "yargs"
import fs from "fs/promises"
import path from "path"

type Args = { days: number }

import { fileURLToPath } from "url"
const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const cleanLogs: CommandModule<{}, Args> = {
	command: "clean-logs",
	describe: "Delete old log files",
	builder: (y) => y.option("days", { type: "number", default: 7 }),
	handler: async ({ days }) => {
		const dir = path.join(__dirname, "../../logs")
		const cutoff = Date.now() - days * 86400000

		for (const file of await fs.readdir(dir)) {
			const full = path.join(dir, file)
			if ((await fs.stat(full)).mtimeMs < cutoff) await fs.unlink(full)
		}
	},
}
