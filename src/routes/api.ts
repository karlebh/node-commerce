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
import { protectedHandler } from "../middleware/protectedHandler.js"
import {
	login,
	logout,
	me,
	register,
} from "../controllers/auth/auth.controller.js"
import {
	change,
	confirmReset,
	reset,
} from "../controllers/auth/password.controller.js"
import {
	store as storeImage,
	destroy as destroyImage,
} from "../controllers/image.controller.js"
import { requiresOwnership } from "../middleware/requiresOwnership.js"
import { prisma } from "../database/prisma.js"
import { requiresGuest } from "../middleware/requiresGuest.js"
import {
	index as cartIndex,
	addItem,
	removeIteam,
	clearCart,
} from "../controllers/cart.controller.js"

export const productRouter = Router()
productRouter.get("/", asyncHandler(indexProducts))
productRouter.get("/:slug", asyncHandler(showProduct))
productRouter.post("/", protectedHandler(storeProduct))
productRouter.use(requiresOwnership(prisma.product))
productRouter.patch("/:id", protectedHandler(updateProduct))
productRouter.delete("/:id", protectedHandler(destroyProduct))

export const authRouter = Router()
authRouter.post("/register", requiresGuest, asyncHandler(register))
authRouter.post("/login", requiresGuest, asyncHandler(login))
authRouter.post("/reset-password", requiresGuest, asyncHandler(reset))
authRouter.post(
	"/confirm-password-reset",
	requiresGuest,
	asyncHandler(confirmReset)
)
authRouter.get("/me", protectedHandler(me))
authRouter.post("/logout", protectedHandler(logout))
authRouter.patch("/change-password", protectedHandler(change))

export const categoryRouter = Router()
categoryRouter.get("/", asyncHandler(indexCategories))
categoryRouter.get("/:name", asyncHandler(showCategory))
categoryRouter.post("/", protectedHandler(storeCategory))
categoryRouter.use(requiresOwnership(prisma.category))
categoryRouter.patch("/:name", protectedHandler(updateCategory))
categoryRouter.delete("/:name", protectedHandler(destroyCategory))

export const imageRouter = Router()
imageRouter.post("/", protectedHandler(storeImage))
imageRouter.delete(
	"/:id",
	protectedHandler(destroyImage, requiresOwnership(prisma.image))
)

export const cartRouter = Router()
cartRouter.use(requiresOwnership(prisma.cart))
cartRouter.get("/", protectedHandler(cartIndex))
cartRouter.post("/", protectedHandler(addItem))
cartRouter.delete("/item", protectedHandler(removeIteam))
cartRouter.delete("/", protectedHandler(clearCart))
