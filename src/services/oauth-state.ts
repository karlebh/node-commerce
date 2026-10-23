import type { Request } from "express"
import jwt from "jsonwebtoken"
import { OauthProviders } from "@prisma/client"
import { env } from "../configs/env.js"

type StoreCallback = (err: Error | null, state?: string) => void
type VerifyCallback = (
	err: Error | null,
	ok?: boolean,
	info?: { message: string }
) => void

type StatePayload = {
	purpose: "oauth-state"
	provider: OauthProviders
}

export class SignedStateStore {
	constructor(private readonly provider: OauthProviders) {}

	store(req: Request, callback: StoreCallback): void
	store(
		req: Request,
		meta: Record<string, unknown>,
		callback: StoreCallback
	): void
	store(
		_req: Request,
		metaOrCb: Record<string, unknown> | StoreCallback,
		maybeCb?: StoreCallback
	): void {
		const callback = (
			typeof metaOrCb === "function" ? metaOrCb : maybeCb
		) as StoreCallback

		const state = jwt.sign(
			{
				purpose: "oauth-state",
				provider: this.provider,
			} satisfies StatePayload,
			env.JWT_SECRET,
			{ expiresIn: "10m" }
		)
		callback(null, state)
	}

	verify(req: Request, providedState: string, callback: VerifyCallback): void
	verify(
		req: Request,
		providedState: string,
		meta: Record<string, unknown>,
		callback: VerifyCallback
	): void
	verify(
		_req: Request,
		providedState: string,
		metaOrCb: Record<string, unknown> | VerifyCallback,
		maybeCb?: VerifyCallback
	): void {
		const callback = (
			typeof metaOrCb === "function" ? metaOrCb : maybeCb
		) as VerifyCallback

		try {
			const payload = jwt.verify(
				providedState,
				env.JWT_SECRET
			) as Partial<StatePayload>

			if (
				payload.purpose !== "oauth-state" ||
				payload.provider !== this.provider
			) {
				callback(null, false, { message: "Invalid oauth state" })
				return
			}

			callback(null, true)
		} catch {
			callback(null, false, { message: "Invalid or expired oauth state" })
		}
	}
}
