/** A downward drag of `dy` pixels over `ms` milliseconds closes a bottom sheet when it is
 *  long enough, or short but quick. */
export function shouldDismissSheet(dy: number, ms: number): boolean {
	return dy > 96 || (dy > 24 && dy / Math.max(ms, 1) > 0.5);
}
