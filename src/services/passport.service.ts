import { Strategy as GoogleStrategy } from "passport-google-oauth20"
import { Strategy as GitHubStrategy } from "passport-github2"
import passport from "passport"
import type { StateStore } from "passport-oauth2"
import { OauthProviders } from "@prisma/client"
import { prisma } from "../database/prisma.js"
import { SignedStateStore } from "./oauth-state.js"

passport.use(
	new GoogleStrategy(
		{
			clientID: process.env.GOOGLE_CLIENT_ID!,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
			callbackURL: process.env.GOOGLE_CALLBACK_URL!,
			store: new SignedStateStore(
				OauthProviders.GOOGLE
			) as unknown as StateStore,
		},
		async (_accessToken, _refreshToken, googleProfile, done) => {
			try {
				const googleEmail =
					googleProfile.emails?.[0]?.value?.toLowerCase()
				const isGoogleEmailVerified =
					googleProfile.emails?.[0]?.verified === true

				if (!googleEmail || !isGoogleEmailVerified) {
					return done(null, false, {
						message: "Verified email required",
					})
				}

				const linkedGoogleAccount =
					await prisma.oAuthAccount.findUnique({
						where: {
							provider_providerAccountId: {
								provider: OauthProviders.GOOGLE,
								providerAccountId: googleProfile.id,
							},
						},
						include: { user: true },
					})

				if (linkedGoogleAccount) {
					return done(null, linkedGoogleAccount.user)
				}

				const userWithSameEmail = await prisma.user.findUnique({
					where: { email: googleEmail },
				})

				if (userWithSameEmail) {
					return done(
						new Error(
							"Sign in to your existing account before linking Google"
						)
					)
				}

				const newUsername =
					googleProfile.displayName?.trim().slice(0, 20) ||
					googleEmail.split("@")[0]?.slice(0, 20) ||
					googleEmail.slice(0, 20)

				const newUser = await prisma.$transaction(async (tx) => {
					const createdUser = await tx.user.create({
						data: { username: newUsername, email: googleEmail },
					})

					await tx.oAuthAccount.create({
						data: {
							provider: OauthProviders.GOOGLE,
							providerAccountId: googleProfile.id,
							userId: createdUser.id,
						},
					})

					return createdUser
				})

				return done(null, newUser)
			} catch (error) {
				return done(error as Error)
			}
		}
	)
)

passport.use(
	new GitHubStrategy(
		{
			clientID: process.env.GITHUB_CLIENT_ID!,
			clientSecret: process.env.GITHUB_CLIENT_SECRET!,
			callbackURL: process.env.GITHUB_CALLBACK_URL!,
			scope: ["user:email"],
			store: new SignedStateStore(
				OauthProviders.GITHUB
			) as unknown as StateStore,
		},
		async (_accessToken, _refreshToken, githubProfile, done) => {
			try {
				const primaryEmailEntry =
					githubProfile.emails?.find((e) => e.verified) ??
					githubProfile.emails?.[0]
				const githubEmail = primaryEmailEntry?.value?.toLowerCase()

				if (!githubEmail || primaryEmailEntry?.verified !== true) {
					return done(null, false, {
						message: "Verified email required",
					})
				}

				const linkedGithubAccount =
					await prisma.oAuthAccount.findUnique({
						where: {
							provider_providerAccountId: {
								provider: OauthProviders.GITHUB,
								providerAccountId: githubProfile.id,
							},
						},
						include: { user: true },
					})

				if (linkedGithubAccount) {
					return done(null, linkedGithubAccount.user)
				}

				const userWithSameEmail = await prisma.user.findUnique({
					where: { email: githubEmail },
				})

				if (userWithSameEmail) {
					return done(
						new Error(
							"Sign in to your existing account before linking GitHub"
						)
					)
				}

				const newUsername =
					githubProfile.username?.trim().slice(0, 20) ||
					githubProfile.displayName?.trim().slice(0, 20) ||
					githubEmail.split("@")[0]?.slice(0, 20) ||
					githubEmail.slice(0, 20)

				const newUser = await prisma.$transaction(async (tx) => {
					const createdUser = await tx.user.create({
						data: { username: newUsername, email: githubEmail },
					})

					await tx.oAuthAccount.create({
						data: {
							provider: OauthProviders.GITHUB,
							providerAccountId: githubProfile.id,
							userId: createdUser.id,
						},
					})

					return createdUser
				})

				return done(null, newUser)
			} catch (error) {
				return done(error as Error)
			}
		}
	)
)
