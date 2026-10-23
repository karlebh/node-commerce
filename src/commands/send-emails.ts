import type { CommandModule } from "yargs"
import * as mailer from "../services/mailer.service.js"

type Args = { user: string; queue: boolean }

export const sendEmails: CommandModule<{}, Args> = {
	command: "send-emails <user>",
	describe: "Send emails to a user",
	builder: (y) =>
		y
			.positional("user", {
				type: "string",
				demandOption: true,
				describe: "User ID",
			})
			.option("queue", {
				alias: "q",
				type: "boolean",
				default: false,
			}) as unknown as import("yargs").Argv<Args>,
	handler: async ({ user, queue }): Promise<void> => {
		console.log(`Sending emails to ${user}${queue ? " (queued)" : ""}...`)
		await mailer.sendToUser(user, { queue })
		console.log("Done.")
	},
}
