import { vi } from "vitest"

type ModelMock = {
	findUnique: ReturnType<typeof vi.fn>
	findFirst: ReturnType<typeof vi.fn>
	findMany: ReturnType<typeof vi.fn>
	create: ReturnType<typeof vi.fn>
	update: ReturnType<typeof vi.fn>
	updateMany: ReturnType<typeof vi.fn>
	delete: ReturnType<typeof vi.fn>
	deleteMany: ReturnType<typeof vi.fn>
	count: ReturnType<typeof vi.fn>
	upsert: ReturnType<typeof vi.fn>
}

const model = (): ModelMock => ({
	findUnique: vi.fn(),
	findFirst: vi.fn(),
	findMany: vi.fn(),
	create: vi.fn(),
	update: vi.fn(),
	updateMany: vi.fn(),
	delete: vi.fn(),
	deleteMany: vi.fn(),
	count: vi.fn(),
	upsert: vi.fn(),
})

export type PrismaMock = {
	user: ModelMock
	session: ModelMock
	product: ModelMock
	category: ModelMock
	cart: ModelMock
	cartItem: ModelMock
	order: ModelMock
	orderItem: ModelMock
	image: ModelMock
	oAuthAccount: ModelMock
	passwordResetToken: ModelMock
	$transaction: ReturnType<typeof vi.fn>
}

export const createPrismaMock = (): PrismaMock => {
	const base: PrismaMock = {
		user: model(),
		session: model(),
		product: model(),
		category: model(),
		cart: model(),
		cartItem: model(),
		order: model(),
		orderItem: model(),
		image: model(),
		oAuthAccount: model(),
		passwordResetToken: model(),
		$transaction: vi.fn(),
	}

	base.$transaction.mockImplementation(async (arg: unknown) => {
		if (typeof arg === "function") {
			return (arg as (tx: PrismaMock) => Promise<unknown>)(base)
		}
		if (Array.isArray(arg)) {
			return Promise.all(arg)
		}
		return undefined
	})

	return base
}
