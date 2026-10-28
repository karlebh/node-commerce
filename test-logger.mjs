import { logger } from "./src/lib/logger.ts";

logger.info({ userId: 123, email: "john@example.com" }, "User registered");
logger.warn({ endpoint: "/api/auth/login", remaining: 5 }, "Rate limit approaching");
logger.error({ code: "ECONNREFUSED", retry: 3 }, "Database connection failed");
logger.info({ orderId: "ord_456", amount: 99.99, provider: "stripe" }, "Payment processed");

await new Promise((r) => setTimeout(r, 500));
console.log("Done - check logs/app.log");
process.exit(0);
