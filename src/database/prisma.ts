import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"

const adapter = new PrismaPg({
	connectionString: process.env.DATABASE_URL!,
})

const createPrisma = (): PrismaClient =>
	new PrismaClient({
		adapter,
		omit: { user: { passwordHash: true } },
	})

const globalForPrisma = globalThis as unknown as {
	prisma?: ReturnType<typeof createPrisma>
}

export const prisma = globalForPrisma.prisma ?? createPrisma()

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma
}
