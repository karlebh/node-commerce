import type { PaymentGateway } from "../interfaces/payment-gateway.interface.js"

export const PaystackGateway: PaymentGateway = {
	async initializePayment(email, amount) {
		return {
			authorizationUrl: "https://example.com/checkout",
			reference: crypto.randomUUID(),
		}
	},

	async verifyPayment(reference) {
		return true
	},
}
