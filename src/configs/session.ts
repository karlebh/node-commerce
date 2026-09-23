import { env } from "./env.js"

export const SESSION_COOKIE_NAME = "sid"
// e.g. 7 days in ms
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7

export const sessionCookieOptions = {
	httpOnly: true,
	secure: env.NODE_ENV === "production",
	sameSite: "lax" as const,
	path: "/",
	maxAge: SESSION_TTL_MS,
}
