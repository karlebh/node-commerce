import { Worker } from "bullmq"
import { sendPasswordResetEmail, sendRegisterEmail } from "../emails/mailer.js"
import { connection } from "./connection.js"
import type { EmailJobs } from "./emailQueue.js"

export const emailWorker = new Worker(
	"email",
	async (job) => {
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
		}
	},
	{ connection, concurrency: 5 }
)

emailWorker.on("failed", (job, error) => {
	console.error(`Email job ${job?.name} (${job?.id}) failed:`, error.message)
})
