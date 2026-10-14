import type { RequestHandler } from "express"
import type { AuthenticatedHandler } from "../middleware/protectedHandler.js"

export const like: AuthenticatedHandler = async (request, response) => {}

export const unlike: RequestHandler = (request, response) => {}
