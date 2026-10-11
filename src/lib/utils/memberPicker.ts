export type PickerEntry = { value: number | null; label: string };

export const PICKER_LIMIT = 100;

/** Entries whose label contains the query, those starting with it first. */
export function filterEntries(
	entries: PickerEntry[],
	query: string,
	limit = PICKER_LIMIT
): { shown: PickerEntry[]; hidden: number } {
	const needle = query.trim().toLowerCase();
	let found = entries;
	if (needle) {
		const starts: PickerEntry[] = [];
		const contains: PickerEntry[] = [];
		for (const entry of entries) {
			const at = entry.label.toLowerCase().indexOf(needle);
			if (at === 0) starts.push(entry);
			else if (at > 0) contains.push(entry);
		}
		found = [...starts, ...contains];
	}
	return { shown: found.slice(0, limit), hidden: Math.max(0, found.length - limit) };
}

/** The index after moving `step` rows, wrapping at both ends; -1 when there are no rows. */
export function moveIndex(index: number, step: number, length: number): number {
	if (length === 0) return -1;
	return (((index + step) % length) + length) % length;
}
