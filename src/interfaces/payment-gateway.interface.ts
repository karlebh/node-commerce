export interface PaymentGateway {
	initializePayment(
		email: string,
		amount: number
	): Promise<{ authorizationUrl: string; reference: string }>

	verifyPayment(reference: string): Promise<boolean>
}
