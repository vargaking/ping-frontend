import type { MessageType } from '$lib/types/messages.types';
import { timestampMs } from './messageContent';

/** Within this distance of the bottom the list follows new messages, and they count as read. */
export const FOLLOW_DISTANCE_PX = 80;
/** Up to this many screens a jump scrolls smoothly; further, it lands at once. */
export const SMOOTH_JUMP_SCREENS = 3;

export type ScrollMetrics = Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>;

export function distanceFromBottom(m: ScrollMetrics): number {
	return m.scrollHeight - m.scrollTop - m.clientHeight;
}

export function isAtBottom(m: ScrollMetrics): boolean {
	return distanceFromBottom(m) < FOLLOW_DISTANCE_PX;
}

/** More than one screen above the bottom. */
export function isFarFromBottom(m: ScrollMetrics): boolean {
	return distanceFromBottom(m) > m.clientHeight;
}

export function jumpBehavior(m: ScrollMetrics, reducedMotion: boolean): ScrollBehavior {
	if (reducedMotion || distanceFromBottom(m) > SMOOTH_JUMP_SCREENS * m.clientHeight) {
		return 'instant';
	}
	return 'smooth';
}

export function showJumpButton(state: {
	newerExists: boolean;
	atBottom: boolean;
	far: boolean;
	newCount: number;
}): boolean {
	return state.newerExists || (!state.atBottom && (state.far || state.newCount > 0));
}

export function jumpLabel(newCount: number): string {
	if (newCount === 0) return 'Jump to latest';
	return `Jump to latest, ${newCount} new ${newCount === 1 ? 'message' : 'messages'}`;
}

export type SeenMarker = { id: string; timestamp: string };

/** Messages from others after `seen`, the newest message on screen the last time the view was at the bottom. */
export function countNewBelow(
	messages: MessageType[],
	seen: SeenMarker | null,
	meId: number | null
): number {
	if (!seen) return 0;
	const at = messages.findIndex((m) => m.id === seen.id);
	const seenMs = timestampMs(seen.timestamp);
	const below =
		at >= 0 ? messages.slice(at + 1) : messages.filter((m) => timestampMs(m.timestamp) > seenMs);
	return below.filter((m) => m.user_id !== meId && !m.status).length;
}

type EscapeKey = Pick<
	KeyboardEvent,
	| 'key'
	| 'defaultPrevented'
	| 'isComposing'
	| 'repeat'
	| 'ctrlKey'
	| 'metaKey'
	| 'altKey'
	| 'shiftKey'
>;

export function escapeJumpsToLatest(
	event: EscapeKey,
	context: { desktop: boolean; buttonShown: boolean; escapeTaken: boolean }
): boolean {
	if (event.key !== 'Escape') return false;
	if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
	if (event.isComposing || event.repeat || event.defaultPrevented) return false;
	return context.desktop && context.buttonShown && !context.escapeTaken;
}
