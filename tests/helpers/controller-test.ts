import type { Request, RequestHandler, Response } from "express"
import type { ParamsDictionary } from "express-serve-static-core"
import type { ParsedQs } from "qs"
import { vi } from "vitest"

export type ControllerTestRequest<Body = unknown> = {
	body: Body
	params?: ParamsDictionary
	query?: ParsedQs
	userId?: string
	sessionId?: string
	protocol?: string
	baseUrl?: string
	path?: string
	get?: Request["get"]
}

export type ControllerTestResponse = Response<unknown> & {
	status: ReturnType<typeof vi.fn<(statusCode: number) => ControllerTestResponse>>
	json: ReturnType<typeof vi.fn<(body?: unknown) => ControllerTestResponse>>
	send: ReturnType<typeof vi.fn<(body?: unknown) => ControllerTestResponse>>
}

export const createControllerTestResponse = (): ControllerTestResponse => {
	const response = Object.create(null) as ControllerTestResponse
	response.status =
		vi.fn<(statusCode: number) => ControllerTestResponse>()
	response.json = vi.fn<(body?: unknown) => ControllerTestResponse>()
	response.send = vi.fn<(body?: unknown) => ControllerTestResponse>()

	response.status.mockReturnValue(response)
	response.json.mockReturnValue(response)
	response.send.mockReturnValue(response)

	return response
}

export const invokeController = <Body>(
	handler: RequestHandler,
	request: ControllerTestRequest<Body>,
	response: ControllerTestResponse
) =>
	handler(
		request as Request<ParamsDictionary, unknown, Body>,
		response,
		vi.fn()
	)
