import type { CommandModule } from "yargs"
import { prisma } from "../database/prisma.js"
import { searchService } from "../services/search/search.service.js"
import { SEARCH_INDEXES } from "../services/search/search.types.js"
import type { SearchIndex } from "../services/search/search.types.js"

type Args = {
	indexes: string[] | undefined
	batchSize: number
}

export const searchReindex: CommandModule<{}, Args> = {
	command: "search:reindex",
	describe:
		"Reindex Postgres rows into the configured search driver (products, categories, users, reviews)",
	builder: (yargs) =>
		yargs
			.option("indexes", {
				type: "array",
				string: true,
				describe:
					"Limit to specific indexes (space or comma separated). Defaults to all.",
			})
			.option("batchSize", {
				type: "number",
				default: 500,
				describe: "Number of documents per batch",
			}),
	handler: async (args) => {
		try {
			const requested = (args.indexes ?? []).flatMap((value) =>
				value.split(",").map((segment) => segment.trim()).filter(Boolean)
			)
			for (const name of requested) {
				if (!SEARCH_INDEXES.includes(name as SearchIndex)) {
					throw new Error(
						`Unknown index "${name}". Valid: ${SEARCH_INDEXES.join(", ")}`
					)
				}
			}

			const indexes =
				requested.length > 0 ? (requested as SearchIndex[]) : undefined

			console.log(`Reindexing with driver: ${searchService.driver}`)
			const counts = await searchService.reindexAll({
				batchSize: args.batchSize,
				...(indexes && { indexes }),
			})
			for (const [name, count] of Object.entries(counts)) {
				console.log(`  ${name}: ${count}`)
			}
		} finally {
			await prisma.$disconnect()
		}
	},
}
