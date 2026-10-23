import passport from "passport"
import { type Request, type RequestHandler, type Response } from "express"
import { env } from "../../configs/env.js"
import { createSessionAndToken } from "../../helpers/index.js"
import { AppError } from "../../errors/AppError.js"

export const googleStart: RequestHandler = passport.authenticate("google", {
	scope: ["profile", "email"],
	session: false,
})

export const googleAuthenticate: RequestHandler = passport.authenticate(
	"google",
	{
		session: false,
		failureRedirect: `${env.FRONTEND_URL}/login?error=oauth_failed`,
	}
)

export const googleCallback: RequestHandler = async (
	request: Request,
	response: Response
) => {
	const user = request.user as { id: string } | undefined
	if (!user) throw new AppError(401, "Google authentication failed")

	const token = await createSessionAndToken(user.id)

	return response.redirect(
		`${env.FRONTEND_URL}/oauth/callback?token=${encodeURIComponent(token)}`
	)
}
