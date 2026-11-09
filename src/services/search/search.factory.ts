import { env } from "../../configs/env.js"
import { logger } from "../../lib/logger.js"
import type { SearchProvider } from "./search.types.js"
import { PostgresSearchProvider } from "./providers/postgres.provider.js"
import { MeilisearchProvider } from "./providers/meilisearch.provider.js"
import { ElasticsearchProvider } from "./providers/elasticsearch.provider.js"
import { NullSearchProvider } from "./providers/null.provider.js"

export function createSearchProvider(): SearchProvider {
	switch (env.SEARCH_DRIVER) {
		case "meilisearch":
			return new MeilisearchProvider()
		case "elasticsearch":
			return new ElasticsearchProvider()
		case "postgres":
			return new PostgresSearchProvider()
		case "null":
			return new NullSearchProvider()
		default: {
			logger.warn(
				{ driver: env.SEARCH_DRIVER },
				"Unknown SEARCH_DRIVER, falling back to postgres"
			)
			return new PostgresSearchProvider()
		}
	}
}
