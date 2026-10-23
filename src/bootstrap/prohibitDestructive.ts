import { env } from "../configs/env.js"
import { AppError } from "../errors/AppError.js"

const PROHIBITED_IN: ReadonlySet<typeof env.NODE_ENV> = new Set([
	"staging",
	"production",
])

export const prohibitDestructive = (action: string): void => {
	if (PROHIBITED_IN.has(env.NODE_ENV)) {
		throw new AppError(
			500,
			`Refused: '${action}' is prohibited in '${env.NODE_ENV}'.`
		)
	}
}
