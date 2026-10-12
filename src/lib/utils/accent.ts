/** The card surface from app.css, the lightest background the accent is drawn on. */
export const DARK_SURFACE = '#171a1d';

/** Accent text and icons are read against the surface, so they need body-text contrast. */
const MIN_CONTRAST = 4.5;

const HEX = /^#[0-9a-f]{6}$/;

export const ACCENT_PRESETS = [
	{ name: 'Blue', value: '#5b9cf5' },
	{ name: 'Teal', value: '#38b2c4' },
	{ name: 'Green', value: '#3fb68b' },
	{ name: 'Amber', value: '#d9a441' },
	{ name: 'Orange', value: '#e08a4b' },
	{ name: 'Rose', value: '#e5738f' },
	{ name: 'Purple', value: '#a77be0' }
] as const;

// The base theme's --primary pair from app.css. The live tokens can hold the saved accent,
// so a preview of "default" can't read them.
export const DEFAULT_ACCENT = {
	color: 'oklch(0.753 0.069 244.8)',
	foreground: 'oklch(0.187 0.016 244.7)'
};

export const ACCENT_ERROR = 'Use a colour like #1a2b3c.';

/** The server's rule: `#rrggbb`, case-insensitive. Returns it lowercased, or null if invalid. */
export function parseAccent(input: string): string | null {
	const hex = input.trim().toLowerCase();
	return HEX.test(hex) ? hex : null;
}

function channels(hex: string): [number, number, number] {
	return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
	const [r, g, b] = channels(hex).map((value) => {
		const c = value / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
	const [x, y] = [luminance(a), luminance(b)];
	return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function toHsl(hex: string): [number, number, number] {
	const [r, g, b] = channels(hex).map((c) => c / 255);
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	const d = max - min;
	if (d === 0) return [0, 0, l];
	const s = d / (1 - Math.abs(2 * l - 1));
	const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
	return [(h * 60 + 360) % 360, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
	const k = (n: number) => (n + h / 30) % 12;
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
	const part = (n: number) =>
		Math.round(f(n) * 255)
			.toString(16)
			.padStart(2, '0');
	return `#${part(0)}${part(8)}${part(4)}`;
}

export type ReadableAccent = {
	/** The colour to draw: the pick, or the pick with its lightness moved. */
	color: string;
	/** Black or white, whichever reads better on `color`. */
	foreground: string;
	adjusted: boolean;
};

const BLACK = '#000000';
const WHITE = '#ffffff';
const LIGHTNESS_STEPS = 200;

/**
 * Moves the lightness of `accent` away from `surface` until it stands out from it.
 * Black or white on the result always reads, so only the surface contrast needs guarding.
 */
export function readableAccent(accent: string, surface: string = DARK_SURFACE): ReadableAccent {
	const sign = luminance(surface) < 0.18 ? 1 : -1;
	const [h, s, l] = toHsl(accent);
	let color = accent;
	for (
		let step = 1;
		contrastRatio(color, surface) < MIN_CONTRAST && step <= LIGHTNESS_STEPS;
		step++
	) {
		color = fromHsl(h, s, Math.min(1, Math.max(0, l + (sign * step) / LIGHTNESS_STEPS)));
	}
	const foreground = contrastRatio(color, BLACK) >= contrastRatio(color, WHITE) ? BLACK : WHITE;
	return { color, foreground, adjusted: color !== accent };
}

export const ACCENT_TOKENS = [
	'--primary',
	'--primary-foreground',
	'--ring',
	'--sidebar-primary',
	'--sidebar-primary-foreground',
	'--sidebar-ring'
] as const;

export type AccentToken = (typeof ACCENT_TOKENS)[number];

export function accentTokens(accent: string): Record<AccentToken, string> {
	const { color, foreground } = readableAccent(accent);
	return {
		'--primary': color,
		'--primary-foreground': foreground,
		'--ring': color,
		'--sidebar-primary': color,
		'--sidebar-primary-foreground': foreground,
		'--sidebar-ring': color
	};
}
