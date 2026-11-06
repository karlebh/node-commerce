import type { CommandModule } from "yargs"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Prisma } from "@prisma/client"
import { prisma } from "../database/prisma.js"
import { addEmailJob } from "../jobs/emailQueue.js"
import { env } from "../configs/env.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const TEMPLATES_DIR = path.resolve(
	__dirname,
	"..",
	"emails",
	"templates",
	"newsletters"
)

type Args = {
	slug: string
	subject: string
	template: string
	body: string | undefined
	bodyFile: string | undefined
	batchSize: number
}

const unsubscribeUrlFor = (token: string): string =>
	`${env.APP_URL ?? env.FRONTEND_URL}/api/unsubscribe/${token}`

const resolveBody = (args: Args): string => {
	if (args.body) return args.body
	if (args.bodyFile) return fs.readFileSync(args.bodyFile, "utf8")
	return ""
}

export const newsletter: CommandModule<{}, Args> = {
	command: "newsletter",
	describe: "Send a newsletter to all active, non-unsubscribed users",
	builder: (y) =>
		y
			.option("slug", {
				type: "string",
				demandOption: true,
				describe:
					"Unique campaign id. Re-running with the same slug skips users already sent.",
			})
			.option("subject", {
				type: "string",
				demandOption: true,
				describe: "Email subject line",
			})
			.option("template", {
				type: "string",
				default: "default",
				describe:
					"Handlebars template name under src/emails/templates/newsletters/",
			})
			.option("body", {
				type: "string",
				describe:
					"HTML body injected into the template as {{{body}}}",
			})
			.option("bodyFile", {
				type: "string",
				describe:
					"Path to a file whose contents are used as the body (overrides --body)",
			})
			.option("batchSize", {
				type: "number",
				default: 500,
				describe: "Users read per page while fanning out jobs",
			}),
	handler: async (args): Promise<void> => {
		const templatePath = path.join(TEMPLATES_DIR, `${args.template}.hbs`)
		if (!fs.existsSync(templatePath)) {
			throw new Error(`Template not found: ${templatePath}`)
		}

		const body = resolveBody(args)

		const newsletter = await prisma.newsletter.upsert({
			where: { slug: args.slug },
			create: {
				slug: args.slug,
				subject: args.subject,
				template: args.template,
			},
			update: {
				subject: args.subject,
				template: args.template,
			},
		})

		console.info(
			`Newsletter '${newsletter.slug}' (${newsletter.id}) — fanning out jobs`
		)

		let cursor: string | undefined
		let queued = 0
		let skipped = 0

		for (;;) {
			const users = await prisma.user.findMany({
				where: { deletedAt: null, unsubscribedAt: null },
				select: {
					id: true,
					email: true,
					username: true,
					unsubscribeToken: true,
				},
				orderBy: { id: "asc" },
				take: args.batchSize,
				...(cursor && { cursor: { id: cursor }, skip: 1 }),
			})
			if (users.length === 0) break
			cursor = users[users.length - 1]!.id

			for (const user of users) {
				try {
					await prisma.newsletterSend.create({
						data: {
							newsletterId: newsletter.id,
							userId: user.id,
						},
					})
				} catch (error) {
					if (
						error instanceof
							Prisma.PrismaClientKnownRequestError &&
						error.code === "P2002"
					) {
						skipped += 1
						continue
					}
					throw error
				}

				await addEmailJob("newsletter", {
					email: user.email,
					name: user.username,
					subject: args.subject,
					template: args.template,
					unsubscribeUrl: unsubscribeUrlFor(user.unsubscribeToken),
					body,
				})
				queued += 1
			}
		}

		await prisma.newsletter.update({
			where: { id: newsletter.id },
			data: { sentAt: new Date() },
		})

		console.info(
			`Done. Queued ${queued} new send(s), skipped ${skipped} already-sent.`
		)
		await prisma.$disconnect()
	},
}
