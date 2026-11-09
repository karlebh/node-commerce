import { vi } from "vitest"

vi.mock("../src/lib/logger.js", () => {
	const noop = (): void => {}
	const logger = {
		info: noop,
		error: noop,
		warn: noop,
		debug: noop,
		trace: noop,
		fatal: noop,
		child: () => logger,
	}
	return { logger }
})

vi.mock("pino-http", () => ({
	pinoHttp: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}))

vi.mock("../src/jobs/connection.js", () => ({
	connection: {},
}))

vi.mock("bullmq", () => {
	class Queue {
		add = vi.fn(async (name: string) => ({
			id: "test-job-id",
			name,
		}))
	}
	class Worker {
		on = vi.fn()
		close = vi.fn()
	}
	return { Queue, Worker }
})

vi.mock("../src/jobs/emailQueue.js", () => ({
	addEmailJob: vi.fn(async () => ({ id: "test-job-id" })),
	emailQueue: { add: vi.fn() },
}))

vi.mock("../src/services/search/search.service.js", () => ({
	searchService: {
		driver: "null",
		init: vi.fn(async () => {}),
		search: vi.fn(async () => ({
			query: "",
			driver: "null",
			page: 1,
			perPage: 10,
			total: 0,
			hits: [],
			byIndex: {
				products: { index: "products", total: 0, hits: [] },
				categories: { index: "categories", total: 0, hits: [] },
				users: { index: "users", total: 0, hits: [] },
				reviews: { index: "reviews", total: 0, hits: [] },
			},
		})),
		indexDocuments: vi.fn(async () => {}),
		removeDocuments: vi.fn(async () => {}),
		clearIndex: vi.fn(async () => {}),
		indexProduct: vi.fn(async () => {}),
		removeProduct: vi.fn(async () => {}),
		indexCategory: vi.fn(async () => {}),
		removeCategory: vi.fn(async () => {}),
		indexUser: vi.fn(async () => {}),
		removeUser: vi.fn(async () => {}),
		indexReview: vi.fn(async () => {}),
		removeReview: vi.fn(async () => {}),
		reindexAll: vi.fn(async () => ({
			products: 0,
			categories: 0,
			users: 0,
			reviews: 0,
		})),
	},
	searchDriver: "null",
}))

vi.mock("../src/configs/multer.js", () => ({
	UPLOAD_DIR: "/tmp/test-uploads",
	uploader: {
		single: () =>
			(_req: unknown, _res: unknown, next: (err?: unknown) => void) =>
				next(),
	},
	videoUploader: {
		single: () =>
			(_req: unknown, _res: unknown, next: (err?: unknown) => void) =>
				next(),
	},
}))
