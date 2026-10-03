import type { CommandModule } from "yargs"
import { sendEmails } from "./sendEmails.js"
import { cleanLogs } from "./cleanLogs.js"

export const commands: CommandModule<{}, any>[] = [sendEmails, cleanLogs]
