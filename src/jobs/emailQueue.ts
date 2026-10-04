import { Queue } from "bullmq"
import { connection } from "./connection.js"

export type EmailJobs = {
	"password-reset": { email: string; token: string }
	register: { email: string; name: string }
	"password-reset-success": {
		email: string
		name: string
		appName: string
	}
}

export const emailQueue = new Queue("email", {
	connection,
	defaultJobOptions: {
		attempts: 3,
		backoff: { type: "exponential", delay: 5000 },
		removeOnComplete: true,
		removeOnFail: 1000,
	},
})

export const addEmailJob = <K extends keyof EmailJobs>(
	name: K,
	data: EmailJobs[K]
) => emailQueue.add(name, data)
