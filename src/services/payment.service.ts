import type { PaymentGateway } from "../interfaces/payment-gateway.interface.js"

export class PaymentService {
	constructor(private readonly gateway: PaymentGateway) {}

	initialize(email: string, amount: number) {
		return this.gateway.initializePayment(email, amount)
	}

	verify(reference: string) {
		return this.gateway.verifyPayment(reference)
	}
}

export const createPaymentService = (gateway: PaymentGateway) => ({
	initialize: (email: string, amount: number) =>
		gateway.initializePayment(email, amount),

	verify: (reference: string) => gateway.verifyPayment(reference),
})
