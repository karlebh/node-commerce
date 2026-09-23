import "express"

declare global {
	namespace Express {
		interface Request {
			userId?: string
			record?: Record<string, unknown>
		}
	}
}
