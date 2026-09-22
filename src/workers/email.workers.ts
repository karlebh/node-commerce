import { Worker } from "bullmq"

const worker = new Worker(
	"emails",
	async (job) => {
		if (job.name === "send-welcome-email") {
			console.log(`Sending email to ${job.data.email}`)

			// Send email here
		}
	},
	{
		connection: {
			host: "localhost",
			port: 6379,
		},
	}
)

worker.on("completed", (job) => {
	console.log(`Job ${job.id} completed`)
})

worker.on("failed", (job, error) => {
	console.error(`Job ${job?.id} failed`, error)
})
