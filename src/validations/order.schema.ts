import { OrderStatus } from "@prisma/client"
import { z } from "zod"
import { urlQuerySchema } from "./url-query.schema.js"

export const indexOrderSchema = urlQuerySchema.extend({
	status: z.enum(OrderStatus).optional(),
})
