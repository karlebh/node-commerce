import cron, { type ScheduledTask } from "node-cron"
import { env } from "../configs/env.js"
import { logger } from "../lib/logger.js"
import { reconcilePendingPayments } from "../services/payment.service.js"
import { registerPaymentWebhookObservers } from "../webhooks/payment.webhooks.js"
import { connection } from "./connection.js"
import { emailWorker } from "./emailWorker.js"

registerPaymentWebhookObservers()

let isShuttingDown = false
let reconcileTask: ScheduledTask | null = null
let reconcileInFlight = false

const shutdown = async (reason: string): Promise<void> => {
	if (isShuttingDown) return
	isShuttingDown = true

	console.info(`Stopping workers (${reason})`)

	try {
		reconcileTask?.stop()
		await emailWorker.close()
		await connection.quit()
		console.info("Workers stopped")
	} catch (error) {
		console.error("Failed to stop workers cleanly:", error)
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

if (!cron.validate(env.PAYMENT_RECONCILE_CRON)) {
	throw new Error(
		`Invalid PAYMENT_RECONCILE_CRON expression: ${env.PAYMENT_RECONCILE_CRON}`
	)
}

reconcileTask = cron.schedule(env.PAYMENT_RECONCILE_CRON, async () => {
	if (reconcileInFlight) return
	reconcileInFlight = true
	try {
		const summary = await reconcilePendingPayments(
			env.PAYMENT_RECONCILE_CHECK_AFTER_MS,
			env.PAYMENT_RECONCILE_ABANDON_AFTER_MS
		)
		if (summary.checked > 0) {
			logger.info({ summary }, "payment reconciliation run complete")
		}
	} catch (error) {
		logger.error({ err: error }, "payment reconciliation run failed")
	} finally {
		reconcileInFlight = false
	}
})

console.info(
	`Payment reconciliation scheduled with cron '${env.PAYMENT_RECONCILE_CRON}'`
)

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