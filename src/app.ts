import cors from "cors"
import express, { type Request, type Response } from "express"
import helmet from "helmet"
import { pinoHttp } from "pino-http"
import { env } from "./configs/env.js"
import { logger } from "./lib/logger.js"
import { errorHandler } from "./middleware/errorHandler.js"
import { notFound } from "./middleware/notFound.js"
import { apiRateLimiter } from "./middleware/rateLimiter.js"
import {
	authRouter,
	cartRouter,
	categoryRouter,
	imageRouter,
	productRouter,
} from "./routes/api.js"

export const app = express()

app.disable("x-powered-by")
app.use(helmet())
app.use(cors({ origin: env.FRONTEND_URL }))
app.use(express.json({ limit: "1mb" }))
app.use(pinoHttp({ logger }))
app.use("/api", apiRateLimiter)

app.get("/health", (_request: Request, response: Response) =>
	response.json({ status: "ok" })
)
app.use("/api/auth", authRouter)
app.use("/api/categories", categoryRouter)
app.use("/api/products", productRouter)
app.use("/api/images", imageRouter)
app.use("/api/carts", cartRouter)
app.use("/api/orders", cartRouter)
app.use(notFound)
app.use(errorHandler)
