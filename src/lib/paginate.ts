import type { Request } from "express"

type PaginationLink = {
	url: string | null
	label: string
	active: boolean
}

type PaginationMeta<T> = {
	current_page: number
	data: T[]
	first_page_url: string
	from: number | null
	last_page: number
	last_page_url: string
	links: PaginationLink[]
	next_page_url: string | null
	path: string
	per_page: number
	prev_page_url: string | null
	to: number | null
	total: number
}

type QueryValue = string | number | boolean | string[] | undefined

export function paginate<T>({
	request,
	data,
	total,
	page,
	perPage,
	query,
}: {
	request: Request
	data: T[]
	total: number
	page: number
	perPage: number
	query?: Record<string, QueryValue>
}): PaginationMeta<T> {
	const safePage = Math.max(1, Math.floor(page) || 1)
	const safePerPage = Math.max(1, Math.floor(perPage) || 1)

	const path = `${request.protocol}://${request.get("host")}${request.baseUrl}${request.path}`

	const baseQuery: Record<string, QueryValue> =
		query ??
		(Object.fromEntries(
			Object.entries(request.query).filter(([k]) => k !== "page")
		) as Record<string, QueryValue>)

	const buildUrl = (p: number) => {
		const params = new URLSearchParams()
		for (const [key, value] of Object.entries(baseQuery)) {
			if (value === undefined || value === "") continue
			if (Array.isArray(value)) {
				for (const v of value) params.append(key, String(v))
			} else {
				params.append(key, String(value))
			}
		}
		params.set("page", String(p))
		return `${path}?${params.toString()}`
	}

	const lastPage = Math.max(Math.ceil(total / safePerPage), 1)
	const from = total === 0 ? null : (safePage - 1) * safePerPage + 1
	const to = total === 0 ? null : Math.min(safePage * safePerPage, total)

	const window = 2
	const pageNumbers = new Set<number>([1, lastPage])
	for (
		let i = Math.max(1, safePage - window);
		i <= Math.min(lastPage, safePage + window);
		i++
	) {
		pageNumbers.add(i)
	}
	const sortedPages = [...pageNumbers].sort((a, b) => a - b)

	const links: PaginationLink[] = [
		{
			url: safePage > 1 ? buildUrl(safePage - 1) : null,
			label: "&laquo; Previous",
			active: false,
		},
	]

	let prev = 0
	for (const p of sortedPages) {
		if (p - prev > 1) {
			links.push({ url: null, label: "...", active: false })
		}
		links.push({
			url: buildUrl(p),
			label: String(p),
			active: p === safePage,
		})
		prev = p
	}

	links.push({
		url: safePage < lastPage ? buildUrl(safePage + 1) : null,
		label: "Next &raquo;",
		active: false,
	})

	return {
		current_page: safePage,
		data,
		first_page_url: buildUrl(1),
		from,
		last_page: lastPage,
		last_page_url: buildUrl(lastPage),
		links,
		next_page_url: safePage < lastPage ? buildUrl(safePage + 1) : null,
		path,
		per_page: safePerPage,
		prev_page_url: safePage > 1 ? buildUrl(safePage - 1) : null,
		to,
		total,
	}
}
