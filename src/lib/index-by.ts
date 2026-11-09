export const indexBy = <T>(
	items: T[],
	key: (item: T) => string
): Map<string, T[]> => {
	const map = new Map<string, T[]>()
	for (const item of items) {
		const k = key(item)
		const list = map.get(k)
		if (list) list.push(item)
		else map.set(k, [item])
	}
	return map
}
