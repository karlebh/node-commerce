import { NotificationType } from "@prisma/client"
import { z } from "zod"
import { urlQuerySchema } from "./url-query.schema.js"

export const indexNotificationsSchema = urlQuerySchema.extend({
	unreadOnly: z
		.enum(["true", "false"])
		.optional()
		.transform((v) => v === "true"),
	type: z.enum(NotificationType).optional(),
})

export const notificationParamSchema = z.object({
	id: z.uuid(),
})

export type IndexNotificationsQuery = z.infer<typeof indexNotificationsSchema>
export type NotificationParams = z.infer<typeof notificationParamSchema>
