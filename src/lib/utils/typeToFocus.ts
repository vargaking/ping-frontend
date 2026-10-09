type KeyLike = Pick<
	KeyboardEvent,
	'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'isComposing' | 'defaultPrevented' | 'getModifierState'
>;

/** True for a keydown that would put text into a focused field: a printable key or a paste. */
export function isTypingKey(e: KeyLike): boolean {
	if (e.defaultPrevented || e.isComposing) return false;
	if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'v') return true;
	if (e.metaKey) return false;
	if ((e.ctrlKey || e.altKey) && !e.getModifierState('AltGraph')) return false;
	return e.key.length === 1 && e.key !== ' ';
}
