import type { CommandModule } from "yargs"
import { sendEmails } from "./send-emails.js"
import { cleanLogs } from "./clean-logs.js"

export const commands: CommandModule<{}, any>[] = [sendEmails, cleanLogs]
