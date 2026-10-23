import { type Request, type RequestHandler, type Response } from "express"
import { env } from "../../configs/env.js"
import { createSessionAndToken } from "../../helpers/index.js"
import { AppError } from "../../errors/AppError.js"

export const oauthCallback =
	(providerLabel: string): RequestHandler =>
	async (request: Request, response: Response) => {
		const user = request.user as { id: string } | undefined
		if (!user)
			throw new AppError(401, `${providerLabel} authentication failed`)

		const token = await createSessionAndToken(user.id)

		return response.redirect(
			`${env.FRONTEND_URL}/oauth/callback?token=${encodeURIComponent(token)}`
		)
	}
