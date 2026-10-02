const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	['day', 86_400],
	['hour', 3_600],
	['minute', 60]
];

export function timeAgo(iso: string, now = Date.now()): string {
	const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
	for (const [unit, size] of UNITS) {
		if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
	}
	return 'just now';
}
