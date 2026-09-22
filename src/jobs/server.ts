import cron from "node-cron"

// Every 5 minutes
cron.schedule("*/5 * * * *", async () => {
	console.log("Checking products...")
})

// Every hour
cron.schedule("0 * * * *", async () => {
	console.log("Updating product stock...")
})

// Every day at midnight
cron.schedule("0 0 * * *", async () => {
	console.log("Running daily cleanup...")
})

// Every day at 2 AM
cron.schedule("0 2 * * *", async () => {
	console.log("Generating daily report...")
})

// Every Monday at 8 AM
cron.schedule("0 8 * * 1", async () => {
	console.log("Generating weekly report...")
})
