/** 1 is Monday, 7 is Sunday, as in `Intl`. */
export type WeekDay = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type QuickDate = {
	key: 'today' | 'yesterday' | 'week' | 'month';
	label: string;
	insert: string;
};

type WeekInfo = { firstDay?: number };
type LocaleWithWeek = Intl.Locale & { getWeekInfo?: () => WeekInfo; weekInfo?: WeekInfo };

/** The first day of the week in a locale; Monday when the engine can't say. */
export function weekStartDay(locale?: string): WeekDay {
	if (!locale) return 1;
	try {
		const info = new Intl.Locale(locale) as LocaleWithWeek;
		const firstDay = (info.getWeekInfo?.() ?? info.weekInfo)?.firstDay;
		return Number.isInteger(firstDay) && firstDay! >= 1 && firstDay! <= 7
			? (firstDay as WeekDay)
			: 1;
	} catch {
		return 1;
	}
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Not `toISOString()`: that is UTC and gives the wrong day around midnight. */
export function localDay(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localMonth(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function quickDates(now: Date, firstDay: WeekDay): QuickDate[] {
	const [year, month, day] = [now.getFullYear(), now.getMonth(), now.getDate()];
	const sinceWeekStart = (now.getDay() - (firstDay % 7) + 7) % 7;
	return [
		{ key: 'today', label: 'Today', insert: `during:${localDay(now)}` },
		{
			key: 'yesterday',
			label: 'Yesterday',
			insert: `during:${localDay(new Date(year, month, day - 1))}`
		},
		{
			key: 'week',
			label: 'This week',
			insert: `after:${localDay(new Date(year, month, day - sinceWeekStart))}`
		},
		{ key: 'month', label: 'This month', insert: `during:${localMonth(now)}` }
	];
}
