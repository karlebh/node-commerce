import { env } from "../configs/env.js"
import { AppError } from "../errors/AppError.js"
import type {
	PaymentGateway,
	PaymentProviderName,
} from "../types/payment.js"
import { createFlutterwaveGateway } from "./flutterwave.js"
import { createPaystackGateway } from "./paystack.js"
import { createStripeGateway } from "./stripe.js"

const gateways: Partial<Record<PaymentProviderName, PaymentGateway>> = {}

if (env.PAYSTACK_SECRET_KEY) {
	gateways.paystack = createPaystackGateway(env.PAYSTACK_SECRET_KEY)
}

if (env.FLUTTERWAVE_SECRET_KEY && env.FLUTTERWAVE_WEBHOOK_HASH) {
	gateways.flutterwave = createFlutterwaveGateway(
		env.FLUTTERWAVE_SECRET_KEY,
		env.FLUTTERWAVE_WEBHOOK_HASH
	)
}

if (env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET) {
	gateways.stripe = createStripeGateway(
		env.STRIPE_SECRET_KEY,
		env.STRIPE_WEBHOOK_SECRET
	)
}

export const getGateway = (name: PaymentProviderName): PaymentGateway => {
	const gateway = gateways[name]
	if (!gateway) {
		throw new AppError(
			503,
			`Payment provider '${name}' is not configured.`
		)
	}
	return gateway
}

export const availableProviders = (): PaymentProviderName[] =>
	Object.keys(gateways) as PaymentProviderName[]
