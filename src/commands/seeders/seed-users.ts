import { faker } from "@faker-js/faker"
import bcrypt from "bcryptjs"
import type { CommandModule } from "yargs"
import { prisma } from "../../database/prisma.js"

const USER_COUNT = 20
const SEED_PASSWORD = "Password123!"

export const seedUsers: CommandModule = {
	command: "seed-users",
	describe: `Seed ${USER_COUNT} sample users (password: ${SEED_PASSWORD})`,
	handler: async () => {
		try {
			faker.seed(975318642)
			const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12)
			const users = Array.from({ length: USER_COUNT }, (_, index) => {
				const sequence = String(index + 1).padStart(2, "0")
				const firstName = faker.person.firstName()
				const lastName = faker.person.lastName()

				return {
					username: `${firstName}${sequence}`.slice(0, 20),
					email: faker.internet.email({
						firstName: `${firstName}${sequence}`,
						lastName,
						provider: "example.com",
					}),
					passwordHash,
					createdAt: new Date(),
				}
			})

			const result = await prisma.user.createMany({
				data: users,
				skipDuplicates: true,
			})

			console.log(
				`Seeded ${result.count} of ${USER_COUNT} sample users. All seeded users use password: ${SEED_PASSWORD}`
			)
		} finally {
			await prisma.$disconnect()
		}
	},
}
