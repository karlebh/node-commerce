export const createSlug = (name: string): string => {
	return `${name
		.toLowerCase()
		.trim()
		.replace(/\s+/g, "-")
		.replace(/[^\w-]/g, "")}-${crypto.randomUUID()}`
}
