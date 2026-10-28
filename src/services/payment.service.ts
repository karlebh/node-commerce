import {
	IdempotencyStatus,
	type Payment,
	PaymentProvider,
	PaymentStatus,
	Prisma,
} from "@prisma/client"
import { env } from "../configs/env.js"
import { prisma } from "../database/prisma.js"
import { AppError } from "../errors/AppError.js"
import { getGateway } from "../gateways/index.js"
import {
	generateReference,
	hashPaymentRequest,
	isReplayablePaymentSuccess,
	serializeResponse,
} from "../helpers/index.js"
import type {
	InitializePaymentArgs,
	InitializePaymentResponse,
	NormalizedPaymentStatus,
	PaymentOutcomeArgs,
	PaymentProviderName,
	WebhookHeaders,
} from "../types/payment.js"

const PROVIDER_NAME_TO_ENUM: Record<PaymentProviderName, PaymentProvider> = {
	paystack: PaymentProvider.PAYSTACK,
	flutterwave: PaymentProvider.FLUTTERWAVE,
	stripe: PaymentProvider.STRIPE,
}

const PROVIDER_ENUM_TO_NAME: Record<PaymentProvider, PaymentProviderName> = {
	[PaymentProvider.PAYSTACK]: "paystack",
	[PaymentProvider.FLUTTERWAVE]: "flutterwave",
	[PaymentProvider.STRIPE]: "stripe",
}

const STATUS_MAP: Record<NormalizedPaymentStatus, PaymentStatus> = {
	success: PaymentStatus.SUCCESS,
	failed: PaymentStatus.FAILED,
	pending: PaymentStatus.PENDING,
	abandoned: PaymentStatus.ABANDONED,
}

const reservePaymentIdempotencyKey = async (
	userId: string,
	key: string,
	requestHash: string
): Promise<
	| { kind: "reserved"; id: string }
	| { kind: "replay"; response: Prisma.JsonObject }
> => {
	const now = new Date()
	const expiresAt = new Date(now.getTime() + env.IDEMPOTENCY_TTL_MS)

	try {
		const record = await prisma.idempotencyKey.create({
			data: {
				userId,
				key,
				requestHash,
				status: IdempotencyStatus.IN_PROGRESS,
				expiresAt,
			},
		})

		return { kind: "reserved", id: record.id }
	} catch (error) {
		if (
			!(
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === "P2002"
			)
		) {
			throw error
		}
	}

	const existing = await prisma.idempotencyKey.findUnique({
		where: { userId_key: { userId, key } },
	})
	if (!existing) {
		throw new AppError(409, "Unable to reserve idempotency key")
	}

	if (existing.expiresAt <= now) {
		const reclaimed = await prisma.idempotencyKey.updateMany({
			where: { id: existing.id, expiresAt: { lte: now } },
			data: {
				requestHash,
				status: IdempotencyStatus.IN_PROGRESS,
				responseStatus: null,
				responseBody: Prisma.DbNull,
				expiresAt,
			},
		})
		if (reclaimed.count === 1) {
			return { kind: "reserved", id: existing.id }
		}

		throw new AppError(
			409,
			"Payment initialization with this idempotency key is still in progress"
		)
	}

	if (existing.requestHash !== requestHash) {
		throw new AppError(
			409,
			"Idempotency key was already used with different payment details"
		)
	}

	if (isReplayablePaymentSuccess(existing)) {
		return {
			kind: "replay",
			response: existing.responseBody,
		}
	}

	if (existing.status === IdempotencyStatus.COMPLETED) {
		throw new AppError(500, "Stored idempotency response is invalid")
	}

	if (existing.status === IdempotencyStatus.FAILED) {
		throw new AppError(
			409,
			"Previous payment initialization failed; verify its status before retrying"
		)
	}

	throw new AppError(
		409,
		"Payment initialization with this idempotency key is still in progress"
	)
}

export const initializePaymentIdempotently = async (
	args: InitializePaymentArgs,
	key: string
): Promise<InitializePaymentResponse | Prisma.JsonObject> => {
	const requestHash = hashPaymentRequest(args)
	const reservation = await reservePaymentIdempotencyKey(
		args.userId,
		key,
		requestHash
	)

	if (reservation.kind === "replay") {
		return reservation.response
	}

	let response: InitializePaymentResponse
	try {
		response = await initializePayment(args)
	} catch (error) {
		await prisma.idempotencyKey.update({
			where: { id: reservation.id },
			data: { status: IdempotencyStatus.FAILED },
		})
		throw error
	}

	await prisma.idempotencyKey.update({
		where: { id: reservation.id },
		data: {
			status: IdempotencyStatus.COMPLETED,
			responseStatus: 201,
			responseBody: serializeResponse(response),
		},
	})

	return response
}

export const initializePayment = async (
	args: InitializePaymentArgs
): Promise<InitializePaymentResponse> => {
	const gateway = getGateway(args.provider)
	const reference = generateReference()
	const currency = args.currency ?? "NGN"

	const payment = await prisma.payment.create({
		data: {
			userId: args.userId,
			orderId: args.orderId ?? null,
			provider: PROVIDER_NAME_TO_ENUM[args.provider],
			reference,
			amount: args.amount,
			currency,
			status: PaymentStatus.PENDING,
		},
	})

	try {
		const result = await gateway.initializePayment({
			email: args.email,
			amount: args.amount,
			currency,
			reference,
			callbackUrl: env.PAYMENT_CALLBACK_URL,
			metadata: { ...args.metadata, paymentId: payment.id },
		})

		const updated = await prisma.payment.update({
			where: { id: payment.id },
			data: {
				providerReference: result.providerReference,
				rawInit: result.raw as Prisma.InputJsonValue,
			},
		})

		return {
			authorizationUrl: result.authorizationUrl,
			reference,
			payment: updated,
		}
	} catch (error) {
		await prisma.payment.update({
			where: { id: payment.id },
			data: { status: PaymentStatus.FAILED },
		})
		throw error
	}
}

export const verifyPayment = async (reference: string): Promise<Payment> => {
	const payment = await prisma.payment.findUnique({ where: { reference } })
	if (!payment) throw new AppError(404, "Payment not found")

	if (payment.status === PaymentStatus.SUCCESS) return payment

	const gateway = getGateway(PROVIDER_ENUM_TO_NAME[payment.provider])
	const result = await gateway.verifyPayment(reference)

	return applyPaymentOutcome({
		payment,
		status: STATUS_MAP[result.status],
		providerReference: result.providerReference,
		amount: result.amount,
		currency: result.currency,
		rawVerify: result.raw as Prisma.InputJsonValue,
	})
}

export const processWebhook = async (
	providerName: PaymentProviderName,
	rawBody: Buffer,
	headers: WebhookHeaders
): Promise<void> => {
	const gateway = getGateway(providerName)
	const event = gateway.parseWebhook(rawBody, headers)
	const providerEnum = PROVIDER_NAME_TO_ENUM[providerName]

	try {
		await prisma.paymentWebhookEvent.create({
			data: {
				provider: providerEnum,
				eventId: event.eventId,
				payload: event.raw as Prisma.InputJsonValue,
			},
		})
	} catch (error) {
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === "P2002"
		) {
			return
		}
		throw error
	}

	const payment = await prisma.payment.findUnique({
		where: { reference: event.reference },
	})
	if (!payment) return

	await applyPaymentOutcome({
		payment,
		status: STATUS_MAP[event.status],
		providerReference: event.providerReference,
		amount: event.amount,
		currency: event.currency,
		rawVerify: event.raw as Prisma.InputJsonValue,
	})
}

const applyPaymentOutcome = async (
	args: PaymentOutcomeArgs
): Promise<Payment> =>
	prisma.$transaction(async (tx) => {
		const amountMismatch = args.amount !== args.payment.amount
		const currencyMismatch =
			args.currency.toUpperCase() !== args.payment.currency.toUpperCase()
		const finalStatus =
			args.status === PaymentStatus.SUCCESS &&
			(amountMismatch || currencyMismatch)
				? PaymentStatus.FAILED
				: args.status

		const updated = await tx.payment.update({
			where: { id: args.payment.id },
			data: {
				status: finalStatus,
				providerReference: args.providerReference,
				rawVerify: args.rawVerify,
			},
		})

		if (
			finalStatus === PaymentStatus.SUCCESS &&
			args.payment.orderId &&
			args.payment.status !== PaymentStatus.SUCCESS
		) {
			await tx.order.update({
				where: { id: args.payment.orderId },
				data: { status: "PAID" },
			})
		}

		return updated
	})
