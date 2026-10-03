import "dotenv/config"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { commands } from "./commands/index.js"

yargs(hideBin(process.argv))
	.command(commands)
	.demandCommand(1, "Specify a command")
	.strict()
	.help()
	.parseAsync()
	.then(() => process.exit(0))
	.catch((err: Error) => {
		console.error(err.message)
		process.exit(1)
	})
