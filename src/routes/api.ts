import { Router } from "express"
import * as productController from "../controllers/product.controller.js"
import * as categoryController from "../controllers/category.controller.js"
import * as authController from "../controllers/auth/auth.controller.js"
import * as googleOauth from "../controllers/oauth/google.controller.js"
import * as githubOauth from "../controllers/oauth/github.controller.js"
import * as passwordController from "../controllers/auth/password.controller.js"
import * as imageController from "../controllers/image.controller.js"
import * as cartController from "../controllers/cart.controller.js"
import * as orderController from "../controllers/order.controller.js"
import * as notificationController from "../controllers/notification.controller.js"
import { asyncHandler } from "../middleware/asyncHandler.js"
import { protectedHandler } from "../middleware/protectedHandler.js"
import { requiresOwnership } from "../middleware/requiresOwnership.js"
import { requiresGuest } from "../middleware/requiresGuest.js"
import { prisma } from "../database/prisma.js"

export const productRouter = Router()
productRouter.get("/", asyncHandler(productController.index))
productRouter.get("/:id", asyncHandler(productController.show))
productRouter.post("/", protectedHandler(productController.store))
productRouter.patch(
	"/:id",
	protectedHandler(
		productController.update,
		requiresOwnership(prisma.product)
	)
)
productRouter.delete(
	"/:id",
	protectedHandler(
		productController.destroy,
		requiresOwnership(prisma.product)
	)
)

export const authRouter = Router()
authRouter.post(
	"/register",
	requiresGuest,
	asyncHandler(authController.register)
)
authRouter.post("/login", requiresGuest, asyncHandler(authController.login))
authRouter.post(
	"/reset-password",
	requiresGuest,
	asyncHandler(passwordController.reset)
)
authRouter.post(
	"/confirm-password-reset",
	requiresGuest,
	asyncHandler(passwordController.confirmReset)
)
authRouter.get("/me", protectedHandler(authController.me))
authRouter.post("/logout", protectedHandler(authController.logout))
authRouter.patch(
	"/change-password",
	protectedHandler(passwordController.change)
)
authRouter.get("/google", requiresGuest, googleOauth.start)
authRouter.get(
	"/google/callback",
	googleOauth.authenticate,
	asyncHandler(googleOauth.callback)
)
authRouter.get("/github", requiresGuest, githubOauth.start)
authRouter.get(
	"/github/callback",
	githubOauth.authenticate,
	asyncHandler(githubOauth.callback)
)

export const categoryRouter = Router()
categoryRouter.get("/", asyncHandler(categoryController.index))
categoryRouter.get("/:name", asyncHandler(categoryController.show))
categoryRouter.post("/", protectedHandler(categoryController.store))
categoryRouter.patch(
	"/:name",
	protectedHandler(
		categoryController.update,
		requiresOwnership(prisma.category)
	)
)
categoryRouter.delete(
	"/:name",
	protectedHandler(
		categoryController.destroy,
		requiresOwnership(prisma.category)
	)
)

export const imageRouter = Router()
imageRouter.post("/", protectedHandler(imageController.store))
imageRouter.delete(
	"/:id",
	protectedHandler(imageController.destroy, requiresOwnership(prisma.image))
)

export const cartRouter = Router()
cartRouter.get(
	"/",
	protectedHandler(cartController.index, requiresOwnership(prisma.cart))
)
cartRouter.post(
	"/",
	protectedHandler(cartController.addItem, requiresOwnership(prisma.cart))
)
cartRouter.delete(
	"/:id",
	protectedHandler(cartController.removeIteam, requiresOwnership(prisma.cart))
)
cartRouter.delete(
	"/clear",
	protectedHandler(cartController.clearCart, requiresOwnership(prisma.cart))
)

export const orderRouter = Router()
orderRouter.get(
	"/",
	protectedHandler(orderController.index, requiresOwnership(prisma.order))
)
orderRouter.get(
	"/:id",
	protectedHandler(orderController.show, requiresOwnership(prisma.order))
)
orderRouter.post(
	"/",
	protectedHandler(orderController.store, requiresOwnership(prisma.order))
)
orderRouter.put(
	"/:id",
	protectedHandler(orderController.update, requiresOwnership(prisma.order))
)
orderRouter.delete(
	"/",
	protectedHandler(orderController.destroy, requiresOwnership(prisma.order))
)
