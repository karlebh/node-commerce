import type { CommandModule } from "yargs"
import { sendEmails } from "./send-emails.js"
import { cleanLogs } from "./clean-logs.js"
import { seedProducts } from "./seed-products.js"

export const commands: CommandModule<{}, any>[] = [
	sendEmails,
	cleanLogs,
	seedProducts,
]
