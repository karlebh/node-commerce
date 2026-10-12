import { connection } from "./connection.js"
import { emailWorker } from "./emailWorker.js"

let isShuttingDown = false

const shutdown = async (reason: string): Promise<void> => {
	if (isShuttingDown) return
	isShuttingDown = true

	console.info(`Stopping email worker (${reason})`)

	try {
		await emailWorker.close()
		await connection.quit()
		console.info("Email worker stopped")
	} catch (error) {
		console.error("Failed to stop email worker cleanly:", error)
		process.exitCode = 1
	}
}

emailWorker.on("ready", () => {
	console.info("Email worker is ready and waiting for queued jobs")
})

emailWorker.on("error", (error) => {
	console.error("Email worker error:", error)
})

connection.on("error", (error) => {
	console.error("Email worker Redis connection error:", error)
})

process.once("SIGINT", () => {
	void shutdown("SIGINT")
})

process.once("SIGTERM", () => {
	void shutdown("SIGTERM")
})

emailWorker.waitUntilReady().catch(async (error: unknown) => {
	console.error("Email worker failed to start:", error)
	process.exitCode = 1
	await shutdown("startup failure")
})