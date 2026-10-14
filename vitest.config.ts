import { defineConfig } from "vitest/config"
import { loadEnv } from "vite"

process.env.NODE_ENV = "test"
Object.assign(process.env, loadEnv("test", process.cwd(), ""))

export default defineConfig({
	test: {
		environment: "node",
		globals: true,
	},
})
