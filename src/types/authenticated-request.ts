import type { Request } from "express"

export type AuthenticatedRequest = Request & {
	userId: string
	sessionId: string
}

type RequestIdentity = Request & {
	userId?: unknown
	sessionId?: unknown
}

export const isAuthenticatedRequest = (
	request: Request
): request is AuthenticatedRequest => {
	const identity = request as RequestIdentity
	return (
		typeof identity.userId === "string" &&
		identity.userId.length > 0 &&
		typeof identity.sessionId === "string" &&
		identity.sessionId.length > 0
	)
}
