export function formatRtt(ms: number | null): string {
	return ms == null ? '—' : `${ms} ms`;
}
