import { Router } from "express"
import {
	destroy,
	index,
	show,
	store,
	update,
} from "../controllers/product.controller.js"
import { asyncHandler } from "../middleware/asyncHandler.js"
import { requireAuth } from "../middleware/auth.js"
import { login, me, register } from "../controllers/user.controller.js"

export const productRouter = Router()
productRouter.get("/", asyncHandler(index))
productRouter.get("/:slug", asyncHandler(show))
productRouter.post("/", requireAuth, asyncHandler(store))
productRouter.patch("/:id", requireAuth, asyncHandler(update))
productRouter.delete("/:id", requireAuth, asyncHandler(destroy))

export const userRouter = Router()
userRouter.post("/register", asyncHandler(register))
userRouter.post("/login", asyncHandler(login))
userRouter.get("/me", requireAuth, asyncHandler(me))
