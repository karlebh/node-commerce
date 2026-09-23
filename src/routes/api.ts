import { Router } from "express"
import {
	destroy as destroyProduct,
	index as indexProducts,
	show as showProduct,
	store as storeProduct,
	update as updateProduct,
} from "../controllers/product.controller.js"
import {
	destroy as destroyCategory,
	index as indexCategories,
	show as showCategory,
	store as storeCategory,
	update as updateCategory,
} from "../controllers/category.controller.js"
import { asyncHandler } from "../middleware/asyncHandler.js"
import { requireAuth } from "../middleware/auth.js"
import { login, me, register } from "../controllers/user.controller.js"
import { requireOwnership } from "../middleware/requireOwnership.js"
import { prisma } from "../database/prisma.js"

export const productRouter = Router()
productRouter.get("/", asyncHandler(indexProducts))
productRouter.get("/:slug", asyncHandler(showProduct))
productRouter.post("/", requireAuth, asyncHandler(storeProduct))
productRouter.patch(
	"/:id",
	requireAuth,
	requireOwnership(prisma.product),
	asyncHandler(updateProduct)
)
productRouter.delete(
	"/:id",
	requireAuth,
	requireOwnership(prisma.product),
	asyncHandler(destroyProduct)
)

export const userRouter = Router()
userRouter.post("/register", asyncHandler(register))
userRouter.post("/login", asyncHandler(login))
userRouter.get("/me", requireAuth, asyncHandler(me))

export const categoryRouter = Router()
categoryRouter.get("/", asyncHandler(indexCategories))
categoryRouter.get("/:name", asyncHandler(showCategory))
categoryRouter.post("/", requireAuth, asyncHandler(storeCategory))
categoryRouter.patch(
	"/:name",
	requireAuth,
	requireOwnership(prisma.category),
	asyncHandler(updateCategory)
)
categoryRouter.delete(
	"/:name",
	requireAuth,
	requireOwnership(prisma.category),
	asyncHandler(destroyCategory)
)
