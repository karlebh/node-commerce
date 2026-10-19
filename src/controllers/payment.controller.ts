import type { NextFunction, Request, RequestHandler, Response } from "express"
import { PaymentService } from "../services/payment.service.js"
import { PaystackGateway } from "../gateways/paystack.js"

// const paymentService = new PaymentService(new PaystackGateway())

export const initializePayment: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { email, amount } = req.body

		// const payment = await paymentService.initialize(email, amount)

		// res.status(200).json(payment)
	} catch (error) {
		next(error)
	}
}

export const verifyPayment: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { reference } = req.params

		// const verified = await paymentService.verify(reference)

		// res.json({ verified })
	} catch (error) {
		next(error)
	}
}
