import { describe, it, expect, vi } from "vitest"
import type { Request } from "express"
import jwt from "jsonwebtoken"
import { OauthProviders } from "@prisma/client"
import { SignedStateStore } from "../../../src/services/oauth-state.js"
import { env } from "../../../src/configs/env.js"

const req = {} as Request

describe("SignedStateStore", () => {
	describe("store", () => {
		it("issues a signed JWT carrying purpose + provider claims", () => {
			const store = new SignedStateStore(OauthProviders.GOOGLE)
			const cb = vi.fn()
			store.store(req, cb)

			const [err, state] = cb.mock.calls[0] as [Error | null, string]
			expect(err).toBeNull()
			expect(typeof state).toBe("string")
			expect(state.split(".").length).toBe(3)

			const payload = jwt.verify(state, env.JWT_SECRET) as {
				purpose: string
				provider: string
				exp: number
			}
			expect(payload.purpose).toBe("oauth-state")
			expect(payload.provider).toBe("GOOGLE")
			expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
		})
	})

	describe("verify", () => {
		it("accepts a state issued by the matching store", () => {
			const store = new SignedStateStore(OauthProviders.GOOGLE)
			const storeCb = vi.fn()
			store.store(req, storeCb)
			const state = storeCb.mock.calls[0]?.[1] as string

			const verifyCb = vi.fn()
			store.verify(req, state, verifyCb)
			expect(verifyCb).toHaveBeenCalledWith(null, true)
		})

		it("rejects a state signed with a wrong secret", () => {
			const store = new SignedStateStore(OauthProviders.GOOGLE)
			const forged = jwt.sign(
				{ purpose: "oauth-state", provider: "GOOGLE" },
				"different-secret-at-least-32-characters-long",
				{ expiresIn: "10m" }
			)

			const cb = vi.fn()
			store.verify(req, forged, cb)
			expect(cb).toHaveBeenCalledWith(null, false, {
				message: "Invalid or expired oauth state",
			})
		})

		it("rejects an expired state", () => {
			const expired = jwt.sign(
				{ purpose: "oauth-state", provider: "GOOGLE" },
				env.JWT_SECRET,
				{ expiresIn: -10 }
			)

			const cb = vi.fn()
			new SignedStateStore(OauthProviders.GOOGLE).verify(req, expired, cb)
			expect(cb.mock.calls[0]?.[1]).toBe(false)
		})

		it("rejects a state issued for a different provider", () => {
			const googleStore = new SignedStateStore(OauthProviders.GOOGLE)
			const githubState = jwt.sign(
				{ purpose: "oauth-state", provider: OauthProviders.GITHUB },
				env.JWT_SECRET,
				{ expiresIn: "10m" }
			)

			const cb = vi.fn()
			googleStore.verify(req, githubState, cb)
			expect(cb).toHaveBeenCalledWith(null, false, {
				message: "Invalid oauth state",
			})
		})

		it("rejects a token missing the oauth-state purpose claim", () => {
			const store = new SignedStateStore(OauthProviders.GOOGLE)
			const notStateToken = jwt.sign(
				{ sub: "user-1" },
				env.JWT_SECRET,
				{ expiresIn: "10m" }
			)

			const cb = vi.fn()
			store.verify(req, notStateToken, cb)
			expect(cb).toHaveBeenCalledWith(null, false, {
				message: "Invalid oauth state",
			})
		})

		it("rejects an outright garbage string", () => {
			const store = new SignedStateStore(OauthProviders.GOOGLE)
			const cb = vi.fn()
			store.verify(req, "not-even-a-jwt", cb)
			expect(cb.mock.calls[0]?.[1]).toBe(false)
		})
	})
})
