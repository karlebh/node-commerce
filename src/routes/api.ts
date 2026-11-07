import express, { Router } from "express"
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
import * as paymentController from "../controllers/payment.controller.js"
import * as reviewController from "../controllers/review.controller.js"
import * as TaskController from "../controllers/task.controllers.js"
import * as unsubscribeController from "../controllers/unsubscribe.controller.js"
import * as userController from "../controllers/user.controller.js"
import * as videoController from "../controllers/video.controller.js"
import { asyncHandler } from "../middleware/asyncHandler.js"
import { protectedHandler } from "../middleware/protectedHandler.js"
import { requiresOwnership } from "../middleware/requiresOwnership.js"
import { requiresGuest } from "../middleware/requiresGuest.js"
import {
	paymentReadRateLimiter,
	paymentWriteRateLimiter,
} from "../middleware/rateLimiter.js"
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
categoryRouter.get("/:id", asyncHandler(categoryController.show))
categoryRouter.post("/", protectedHandler(categoryController.store))
categoryRouter.patch("/:id", protectedHandler(categoryController.update))
categoryRouter.delete("/:id", protectedHandler(categoryController.destroy))

export const imageRouter = Router()
imageRouter.post("/", protectedHandler(imageController.store))
imageRouter.delete(
	"/:id",
	protectedHandler(imageController.destroy, requiresOwnership(prisma.image))
)

export const videoRouter = Router()
videoRouter.post("/", protectedHandler(videoController.store))
videoRouter.delete(
	"/:id",
	protectedHandler(videoController.destroy, requiresOwnership(prisma.video))
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
	"/clear",
	protectedHandler(cartController.clearCart, requiresOwnership(prisma.cart))
)
cartRouter.delete(
	"/:id",
	protectedHandler(cartController.removeIteam, requiresOwnership(prisma.cart))
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
orderRouter.patch(
	"/:id",
	protectedHandler(orderController.update, requiresOwnership(prisma.order))
)
orderRouter.delete(
	"/:id",
	protectedHandler(orderController.destroy, requiresOwnership(prisma.order))
)

export const paymentRouter = Router()
paymentRouter.post(
	"/",
	paymentWriteRateLimiter,
	protectedHandler(paymentController.initializePayment)
)
paymentRouter.get(
	"/verify/:reference",
	paymentReadRateLimiter,
	protectedHandler(paymentController.verifyPayment)
)
paymentRouter.post(
	"/refund/:reference",
	paymentWriteRateLimiter,
	protectedHandler(paymentController.refundPayment)
)

export const paymentWebhookRouter = Router()
paymentWebhookRouter.post(
	"/:provider",
	express.raw({ type: "*/*", limit: "1mb" }),
	paymentController.webhook
)

export const reviewRouter = Router()
reviewRouter.post("/", protectedHandler(reviewController.store))
reviewRouter.patch("/:id", protectedHandler(reviewController.update))
reviewRouter.delete("/:id", protectedHandler(reviewController.destroy))

export const taskRouter = Router()
taskRouter.get("/", protectedHandler(TaskController.index))

export const userRouter = Router()
userRouter.get("/", protectedHandler(userController.index))
userRouter.get("/:id", protectedHandler(userController.show))

export const notificationRouter = Router()
notificationRouter.get("/", protectedHandler(notificationController.index))
notificationRouter.post(
	"/read-all",
	protectedHandler(notificationController.markAllRead)
)
notificationRouter.patch(
	"/:id/read",
	protectedHandler(notificationController.markRead)
)
notificationRouter.delete(
	"/:id",
	protectedHandler(notificationController.destroy)
)

export const unsubscribeRouter = Router()
unsubscribeRouter.get(
	"/:token",
	asyncHandler(unsubscribeController.unsubscribe)
)
unsubscribeRouter.post(
	"/:token",
	asyncHandler(unsubscribeController.unsubscribeOneClick)
)
