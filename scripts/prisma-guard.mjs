#!/usr/bin/env node
import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import "dotenv/config"

const require = createRequire(import.meta.url)
const prismaPkg = require("prisma/package.json")
const prismaBinRel =
	typeof prismaPkg.bin === "string" ? prismaPkg.bin : prismaPkg.bin.prisma
const prismaBin = require.resolve(`prisma/${prismaBinRel}`)

const PROHIBITED_IN = new Set(["staging", "production"])
const NODE_ENV = (process.env.NODE_ENV ?? "development").toLowerCase()

const DESTRUCTIVE_COMMANDS = [
	{ match: ["migrate", "reset"], label: "prisma migrate reset" },
	{ match: ["migrate", "dev"], label: "prisma migrate dev" },
	{ match: ["db", "push"], label: "prisma db push" },
	{ match: ["db", "execute"], label: "prisma db execute" },
]

const DESTRUCTIVE_FLAGS = new Set([
	"--force",
	"--force-reset",
	"--accept-data-loss",
])

const argv = process.argv.slice(2)

const commandHit = DESTRUCTIVE_COMMANDS.find(({ match }) =>
	match.every((token, i) => argv[i] === token)
)
const flagHit = argv.find((arg) => DESTRUCTIVE_FLAGS.has(arg))

if ((commandHit || flagHit) && PROHIBITED_IN.has(NODE_ENV)) {
	const label = commandHit?.label ?? `flag '${flagHit}'`
	console.error(
		`\n  ✗ Refused: ${label} is prohibited in '${NODE_ENV}'.` +
			`\n    Set NODE_ENV=development to run it locally, or use 'prisma migrate deploy' for safe production migrations.\n`
	)
	process.exit(1)
}

const child = spawn(process.execPath, [prismaBin, ...argv], { stdio: "inherit" })
child.on("exit", (code) => process.exit(code ?? 0))
