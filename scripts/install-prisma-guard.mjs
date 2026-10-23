#!/usr/bin/env node
import { writeFileSync, chmodSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const binDir = resolve(here, "..", "node_modules", ".bin")
const guardPath = resolve(here, "prisma-guard.mjs")

if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true })

const sh = `#!/bin/sh
exec node "${guardPath}" "$@"
`

const cmd = `@echo off
node "${guardPath}" %*
`

const ps1 = `#!/usr/bin/env pwsh
& node "${guardPath}" $args
exit $LASTEXITCODE
`

const writeShim = (name, body, mode) => {
	const p = resolve(binDir, name)
	rmSync(p, { force: true })
	writeFileSync(p, body)
	if (mode !== undefined) {
		try {
			chmodSync(p, mode)
		} catch {}
	}
}

writeShim("prisma", sh, 0o755)
writeShim("prisma.cmd", cmd)
writeShim("prisma.ps1", ps1)

console.log("✓ Prisma guard installed in node_modules/.bin")
