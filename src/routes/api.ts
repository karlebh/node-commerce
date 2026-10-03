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
import { requiresAuth } from "../middleware/requiresAuth.js"
import {
	login,
	logout,
	me,
	register,
} from "../controllers/auth/auth.controller.js"
import { requiresOwnership } from "../middleware/requiresOwnership.js"
import { prisma } from "../database/prisma.js"
import { requiresGuest } from "../middleware/requiresGuest.js"
import { resetPassword } from "../controllers/auth/passwors_reset.controller.js"

export const productRouter = Router()
productRouter.get("/", asyncHandler(indexProducts))
productRouter.get("/:slug", asyncHandler(showProduct))
productRouter.post("/", requiresAuth, asyncHandler(storeProduct))
productRouter.patch(
	"/:id",
	requiresAuth,
	requiresOwnership(prisma.product),
	asyncHandler(updateProduct)
)
productRouter.delete(
	"/:id",
	requiresAuth,
	requiresOwnership(prisma.product),
	asyncHandler(destroyProduct)
)

export const authRouter = Router()
authRouter.post("/register", requiresGuest, asyncHandler(register))
authRouter.post("/login", requiresGuest, asyncHandler(login))
authRouter.post("/reset-password", requiresGuest, asyncHandler(resetPassword))
authRouter.get("/me", requiresAuth, asyncHandler(me))
authRouter.post("/logout", requiresAuth, asyncHandler(logout))

export const categoryRouter = Router()
categoryRouter.get("/", asyncHandler(indexCategories))
categoryRouter.get("/:name", asyncHandler(showCategory))
categoryRouter.post("/", requiresAuth, asyncHandler(storeCategory))
categoryRouter.patch(
	"/:name",
	requiresAuth,
	requiresOwnership(prisma.category),
	asyncHandler(updateCategory)
)
categoryRouter.delete(
	"/:name",
	requiresAuth,
	requiresOwnership(prisma.category),
	asyncHandler(destroyCategory)
)
