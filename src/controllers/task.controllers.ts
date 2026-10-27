import type { Request, Response } from "express"
import type { AuthenticatedHandler } from "../middleware/protectedHandler.js"

export const index: AuthenticatedHandler = async (
	request: Request,
	response: Response
): Promise<Response> => {
	return response.status(200).json({})
}
