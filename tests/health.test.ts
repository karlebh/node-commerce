import request from "supertest"
import { describe, expect, it, vi } from "vitest"

vi.mock("../src/database/prisma.js", () => ({
	prisma: {
		product: {},
		category: {},
		image: {},
	},
}))

import { app } from "../src/app.js"

describe("health endpoint", () => {
	it("reports that the API is available", async () => {
		const response = await request(app).get("/health")
		expect(response.status).toBe(200)
		expect(response.body).toEqual({ status: "ok" })
	})

	it("returns a JSON 404 for unknown routes", async () => {
		const response = await request(app).get("/missing")
		expect(response.status).toBe(404)
		expect(response.body.message).toContain("Route GET /missing not found")
	})
})
