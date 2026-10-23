import jwt from "jsonwebtoken"
import { env } from "../../src/configs/env.js"

export const signTestToken = (sub: string, jti: string): string =>
	jwt.sign({ sub, jti }, env.JWT_SECRET, {
		expiresIn: env.JWT_EXPIRES_IN,
	})
