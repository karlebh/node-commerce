import "dotenv/config"
import fs from "node:fs"
import path from "node:path"
import Handlebars from "handlebars"
import nodemailer from "nodemailer"
import { fileURLToPath } from "node:url"
import { env } from "../configs/env.js"

const transporter = nodemailer.createTransport({
	host: process.env.MAIL_HOST,
	port: Number(process.env.MAIL_PORT),
	auth: {
		user: process.env.MAIL_USERNAME,
		pass: process.env.MAIL_PASSWORD,
	},
})

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const loadTemplate = (name: string): Handlebars.TemplateDelegate => {
	const source = fs.readFileSync(
		path.join(__dirname, "templates", `${name}.hbs`),
		"utf8"
	)
	return Handlebars.compile(source)
}

const resetPasswordTemplate = loadTemplate("reset-password")

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
	const resetUrl = `${env.APP_URL ?? env.FRONTEND_URL}/reset-password?token=${token}`

	await transporter.sendMail({
		from: process.env.MAIL_FROM,
		to: email,
		subject: "Reset your password",
		html: resetPasswordTemplate({ resetUrl, expiresInMinutes: 60 }),
	})
}

const registerTemplate = loadTemplate("register")

export async function sendRegisterEmail(email: string, name: string): Promise<void> {
	const loginUrl = `${env.APP_URL ?? env.FRONTEND_URL}/login`

	await transporter.sendMail({
		from: process.env.MAIL_FROM,
		to: email,
		subject: "Welcome!",
		html: registerTemplate({ name, loginUrl }),
	})
}

const resetPasswordSuccessTemplate = loadTemplate("reset-password-success")

export async function sendResetPasswordSuccessEmail(
	email: string,
	username: string,
	appName: string
): Promise<void> {
	await transporter.sendMail({
		from: process.env.MAIL_FROM,
		to: email,
		subject: "Reset Password Successful!",
		html: resetPasswordSuccessTemplate({ username, appName }),
	})
}

const newsletterTemplateCache = new Map<string, Handlebars.TemplateDelegate>()

const loadNewsletterTemplate = (
	name: string
): Handlebars.TemplateDelegate => {
	const cached = newsletterTemplateCache.get(name)
	if (cached) return cached
	const source = fs.readFileSync(
		path.join(__dirname, "templates", "newsletters", `${name}.hbs`),
		"utf8"
	)
	const compiled = Handlebars.compile(source)
	newsletterTemplateCache.set(name, compiled)
	return compiled
}

export async function sendNewsletterEmail(args: {
	email: string
	name: string
	subject: string
	template: string
	unsubscribeUrl: string
	body?: string
}): Promise<void> {
	const render = loadNewsletterTemplate(args.template)
	await transporter.sendMail({
		from: process.env.MAIL_FROM,
		to: args.email,
		subject: args.subject,
		html: render({
			name: args.name,
			appName: env.APP_NAME,
			unsubscribeUrl: args.unsubscribeUrl,
			body: args.body ?? "",
		}),
		headers: {
			"List-Unsubscribe": `<${args.unsubscribeUrl}>`,
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		},
	})
}
