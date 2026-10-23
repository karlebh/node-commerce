import passport from "passport"
import type { RequestHandler } from "express"
import { env } from "../../configs/env.js"
import { oauthCallback } from "./shared.js"

export const start: RequestHandler = passport.authenticate("github", {
	scope: ["user:email"],
	session: env.OAUTH_SESSION,
})

export const authenticate: RequestHandler = passport.authenticate("github", {
	session: env.OAUTH_SESSION,
	failureRedirect: `${env.FRONTEND_URL}/login?error=oauth_failed`,
})

export const callback: RequestHandler = oauthCallback("GitHub")
