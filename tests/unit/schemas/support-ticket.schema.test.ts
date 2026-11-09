import { describe, expect, it } from "vitest"
import {
	createTicketMessageSchema,
	createTicketSchema,
	indexTicketsSchema,
	updateTicketSchema,
} from "../../../src/validations/support-ticket.schema.js"

const VENDOR_UUID = "11111111-2222-4333-8444-555555555555"

describe("createTicketSchema", () => {
	it("accepts a minimal ticket", () => {
		const parsed = createTicketSchema.parse({
			subject: "Help",
			body: "Something went wrong",
		})
		expect(parsed.subject).toBe("Help")
		expect(parsed.body).toBe("Something went wrong")
	})

	it("accepts a ticket with vendor and priority", () => {
		const parsed = createTicketSchema.parse({
			vendorId: VENDOR_UUID,
			subject: "Late delivery",
			body: "Order missed delivery window",
			priority: "URGENT",
		})
		expect(parsed.vendorId).toBe(VENDOR_UUID)
		expect(parsed.priority).toBe("URGENT")
	})

	it("rejects subject shorter than 3 characters", () => {
		expect(() =>
			createTicketSchema.parse({ subject: "hi", body: "Issue" })
		).toThrow()
	})

	it("rejects empty body", () => {
		expect(() =>
			createTicketSchema.parse({ subject: "Hello", body: "" })
		).toThrow()
	})

	it("rejects invalid priority", () => {
		expect(() =>
			createTicketSchema.parse({
				subject: "Hello",
				body: "Issue",
				priority: "WHATEVER",
			})
		).toThrow()
	})

	it("rejects non-uuid vendorId", () => {
		expect(() =>
			createTicketSchema.parse({
				vendorId: "not-a-uuid",
				subject: "Hello",
				body: "Issue",
			})
		).toThrow()
	})
})

describe("updateTicketSchema", () => {
	it("accepts status only", () => {
		expect(updateTicketSchema.parse({ status: "CLOSED" })).toEqual({
			status: "CLOSED",
		})
	})

	it("accepts priority only", () => {
		expect(updateTicketSchema.parse({ priority: "HIGH" })).toEqual({
			priority: "HIGH",
		})
	})

	it("rejects unknown status", () => {
		expect(() => updateTicketSchema.parse({ status: "FROZEN" })).toThrow()
	})
})

describe("indexTicketsSchema", () => {
	it("coerces pagination defaults", () => {
		const parsed = indexTicketsSchema.parse({})
		expect(parsed.page).toBe(1)
		expect(parsed.perPage).toBe(12)
	})

	it("accepts role, status, and priority filters", () => {
		const parsed = indexTicketsSchema.parse({
			role: "vendor",
			status: "OPEN",
			priority: "HIGH",
		})
		expect(parsed.role).toBe("vendor")
		expect(parsed.status).toBe("OPEN")
		expect(parsed.priority).toBe("HIGH")
	})

	it("rejects an unknown role", () => {
		expect(() => indexTicketsSchema.parse({ role: "admin" })).toThrow()
	})
})

describe("createTicketMessageSchema", () => {
	it("accepts a non-empty body", () => {
		expect(createTicketMessageSchema.parse({ body: "Hello" })).toEqual({
			body: "Hello",
		})
	})

	it("rejects an empty body", () => {
		expect(() => createTicketMessageSchema.parse({ body: "   " })).toThrow()
	})

	it("rejects a body over 5000 chars", () => {
		expect(() =>
			createTicketMessageSchema.parse({ body: "x".repeat(5001) })
		).toThrow()
	})
})
