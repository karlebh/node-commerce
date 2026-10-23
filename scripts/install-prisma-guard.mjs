#!/usr/bin/env node
import { writeFileSync, chmodSync, existsSync, mkdirSync } from "node:fs"
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

writeFileSync(resolve(binDir, "prisma"), sh)
try {
	chmodSync(resolve(binDir, "prisma"), 0o755)
} catch {}
writeFileSync(resolve(binDir, "prisma.cmd"), cmd)
writeFileSync(resolve(binDir, "prisma.ps1"), ps1)

console.log("✓ Prisma guard installed in node_modules/.bin")
