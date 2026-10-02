const SEPARATORS = /[\s_\-.]+/;
export const TONE_COUNT = 6;

const TONE_CLASSES = [
	'bg-avatar-1 text-avatar-1-fg',
	'bg-avatar-2 text-avatar-2-fg',
	'bg-avatar-3 text-avatar-3-fg',
	'bg-avatar-4 text-avatar-4-fg',
	'bg-avatar-5 text-avatar-5-fg',
	'bg-avatar-6 text-avatar-6-fg'
];

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter() : null;

function firstGrapheme(text: string): string {
	if (segmenter) {
		for (const { segment } of segmenter.segment(text)) return segment;
		return '';
	}
	return Array.from(text)[0] ?? '';
}

export function initials(name: string, max = 2): string {
	const parts = name.split(SEPARATORS).filter(Boolean);
	if (parts.length === 0) return '?';
	const letters = parts.length === 1 ? [parts[0]] : parts.slice(0, max);
	return letters.map((part) => firstGrapheme(part).toLocaleUpperCase()).join('');
}

/** Stable tone index in 1..6 for any id. */
export function avatarTone(id: number | string): number {
	let hash = 0;
	for (const char of String(id)) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
	return (hash % TONE_COUNT) + 1;
}

export function toneClass(tone: number): string {
	return TONE_CLASSES[tone - 1] ?? TONE_CLASSES[0];
}

export function avatarToneClass(id: number | string): string {
	return toneClass(avatarTone(id));
}

/** Tone classes of a server's text icon, or of its initials when it has none. */
export function serverToneClass(
	id: number | string,
	iconText?: string | null,
	iconTone?: number | null
): string {
	return iconText ? toneClass(iconTone ?? avatarTone(id)) : avatarToneClass(id);
}

/** Split into user-perceived characters, so an emoji sequence counts once. */
export function graphemes(text: string): string[] {
	if (segmenter) return Array.from(segmenter.segment(text), ({ segment }) => segment);
	return Array.from(text);
}
