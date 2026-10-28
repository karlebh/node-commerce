import { EventEmitter } from "node:events"
import type { Order, Payment, PaymentStatus } from "@prisma/client"
import { logger } from "../lib/logger.js"
import type { PaymentProviderName } from "../types/payment.js"

export type PaymentWebhookContext = {
	payment: Payment
	order: Order | null
	previousStatus: PaymentStatus
	provider: PaymentProviderName
	rawEvent: unknown
}

type PaymentWebhookEvents = {
	"payment.success": [PaymentWebhookContext]
	"payment.failed": [PaymentWebhookContext]
	"payment.abandoned": [PaymentWebhookContext]
	"payment.pending": [PaymentWebhookContext]
}

type PaymentWebhookEventName = keyof PaymentWebhookEvents

type PaymentWebhookListener<E extends PaymentWebhookEventName> = (
	...args: PaymentWebhookEvents[E]
) => void | Promise<void>

class PaymentWebhookEmitter extends EventEmitter {
	on<E extends PaymentWebhookEventName>(
		event: E,
		listener: PaymentWebhookListener<E>
	): this {
		return super.on(event, listener as (...args: unknown[]) => void)
	}

	emit<E extends PaymentWebhookEventName>(
		event: E,
		...args: PaymentWebhookEvents[E]
	): boolean {
		return super.emit(event, ...args)
	}
}

export const paymentWebhookEvents = new PaymentWebhookEmitter()

const STATUS_TO_EVENT: Record<PaymentStatus, PaymentWebhookEventName | null> = {
	SUCCESS: "payment.success",
	FAILED: "payment.failed",
	ABANDONED: "payment.abandoned",
	PENDING: "payment.pending",
}

export const dispatchPaymentWebhookEvent = (
	context: PaymentWebhookContext
): void => {
	const event = STATUS_TO_EVENT[context.payment.status]
	if (!event) return
	if (context.payment.status === context.previousStatus) return

	try {
		paymentWebhookEvents.emit(event, context)
	} catch (error) {
		logger.error(
			{ err: error, event, paymentId: context.payment.id },
			"payment webhook listener threw"
		)
	}
}

export const registerPaymentWebhookObservers = (): void => {
	// Add observers here. Examples:
	//
	// paymentWebhookEvents.on("payment.success", async ({ payment, order }) => {
	//     if (!order) return
	//     // mark order fulfilled, send receipt, enqueue delivery job, etc.
	// })
	//
	// paymentWebhookEvents.on("payment.failed", async ({ payment, order }) => {
	//     // notify customer, release reserved stock, etc.
	// })
}
