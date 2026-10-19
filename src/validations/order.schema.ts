import { OrderStatus } from "@prisma/client"
import { z } from "zod"
import { urlQuerySchema } from "./url-query.schema.js"

export const indexOrderSchema = urlQuerySchema.extend({
	status: z.enum(OrderStatus).optional(),
})

export const orderSchema = z.object({
	id: z.cuid2(),
})

export const updateOrderschema = z.object({
	status: z.enum(OrderStatus),
})

export type IndexOrderQuery = z.infer<typeof indexOrderSchema>
export type OrderParams = z.infer<typeof orderSchema>
export type UpdateOrderInput = z.infer<typeof updateOrderschema>
