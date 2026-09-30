// Mirrors the backend's upload checks so an obviously bad file never leaves the browser.
export const ICON_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const ICON_MAX_BYTES = 5 * 1024 * 1024;

/** The reason a file can't be used as a server icon, or null when it can. */
export function iconProblem(file: File): string | null {
	if (!ICON_TYPES.includes(file.type)) return 'Use a PNG, JPG, WebP or GIF image.';
	if (file.size > ICON_MAX_BYTES) return 'That image is over 5 MB.';
	return null;
}
