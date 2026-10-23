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

vi.mock("../src/configs/multer.js", () => ({
	UPLOAD_DIR: "/tmp/test-uploads",
	uploader: {
		single: () =>
			(_req: unknown, _res: unknown, next: (err?: unknown) => void) =>
				next(),
	},
}))
