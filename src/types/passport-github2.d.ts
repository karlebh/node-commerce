declare module "passport-github2" {
	import type { Request } from "express"
	import type { Strategy as PassportStrategy } from "passport"

	export interface Profile {
		id: string
		username?: string
		displayName?: string
		emails?: Array<{ value: string; primary?: boolean; verified?: boolean }>
		photos?: Array<{ value: string }>
		provider: "github"
		_json?: Record<string, unknown>
	}

	export interface StrategyOptions {
		clientID: string
		clientSecret: string
		callbackURL?: string
		scope?: string | string[]
		userAgent?: string
		allRawEmails?: boolean
		passReqToCallback?: false
		state?: boolean | string
		store?: unknown
	}

	export type VerifyCallback = (
		err: Error | null | undefined,
		user?: Express.User | false,
		info?: object
	) => void

	export type VerifyFunction = (
		accessToken: string,
		refreshToken: string,
		profile: Profile,
		done: VerifyCallback
	) => void

	export class Strategy extends PassportStrategy {
		constructor(options: StrategyOptions, verify: VerifyFunction)
		name: string
	}
}
