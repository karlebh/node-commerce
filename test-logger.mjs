import { logger } from "./src/lib/logger.ts";

logger.info("User registered", { userId: 123, email: "john@example.com" });
logger.warn("Rate limit approaching", { endpoint: "/api/auth/login", remaining: 5 });
logger.error("Database connection failed", { code: "ECONNREFUSED", retry: 3 });
logger.info("Payment processed", { orderId: "ord_456", amount: 99.99, provider: "stripe" });

await new Promise((r) => setTimeout(r, 500));
console.log("Done - check logs/app.log");
process.exit(0);