import { Worker } from "bullmq"
import {
	sendPasswordResetEmail,
	sendRegisterEmail,
	sendResetPasswordSuccessEmail,
} from "../emails/mailer.js"
import { connection } from "./connection.js"
import type { EmailJobs } from "./emailQueue.js"

export const emailWorker = new Worker(
	"email",
	async (job): Promise<void> => {
		switch (job.name) {
			case "password-reset": {
				const { email, token } = job.data as EmailJobs["password-reset"]
				await sendPasswordResetEmail(email, token)
				break
			}
			case "register": {
				const { email, name } = job.data as EmailJobs["register"]
				await sendRegisterEmail(email, name)
				break
			}
			case "password-reset-success": {
				const { email, name, appName } =
					job.data as EmailJobs["password-reset-success"]
				await sendResetPasswordSuccessEmail(email, name, appName)
				break
			}
			default:
				throw new Error(`Unsupported email job: ${job.name}`)
		}
	},
	{ connection, concurrency: 5 }
)

emailWorker.on("failed", (job, error) => {
	console.error(`Email job ${job?.name} (${job?.id}) failed:`, error.message)
})

emailWorker.on("completed", (job) => {
	console.info(`Email job ${job.name} (${job.id}) completed`)
})

emailWorker.on("completed", (job) => {
	console.info(`Email job ${job.name} (${job.id}) completed`)
})
