import type { CommandModule } from "yargs"
import { sendEmails } from "./send-emails.js"
import { cleanLogs } from "./clean-logs.js"
import { seedProducts } from "./seeders/seed-products.js"
import { seedUsers } from "./seeders/seed-users.js"

export const commands: CommandModule<{}, any>[] = [
	sendEmails,
	cleanLogs,
	seedProducts,
	seedUsers,
]
