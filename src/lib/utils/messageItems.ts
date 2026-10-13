import type { MessageType } from '$lib/types/messages.types';
import { continuesGroup } from './messageGroups';

export type RenderItem =
	| { kind: 'date'; key: string; label: string }
	| { kind: 'unread'; key: string }
	| { kind: 'call'; key: string; message: MessageType }
	| { kind: 'group'; key: string; messages: MessageType[] };

function dayKey(ts: string) {
	return new Date(ts).toDateString();
}

function dayLabel(ts: string) {
	const d = new Date(ts);
	const today = new Date();
	const yesterday = new Date();
	yesterday.setDate(today.getDate() - 1);
	if (d.toDateString() === today.toDateString()) return 'Today';
	if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
	return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Lays messages out for the list: day dividers, the unread divider, and runs of one author's
 *  messages. A call row stands alone and never joins a run. */
export function buildRenderItems(
	messages: MessageType[],
	unreadAnchorId: string | null
): RenderItem[] {
	const result: RenderItem[] = [];
	let lastDay: string | null = null;
	let group: MessageType[] | null = null;
	let unreadInserted = false;

	const flush = () => {
		if (group) {
			result.push({
				kind: 'group',
				key: `g-${group[0].id}`,
				messages: group
			});
			group = null;
		}
	};

	for (const m of messages) {
		const day = dayKey(m.timestamp);
		if (day !== lastDay) {
			flush();
			result.push({ kind: 'date', key: `d-${day}`, label: dayLabel(m.timestamp) });
			lastDay = day;
		}

		if (!unreadInserted && unreadAnchorId != null && m.id === unreadAnchorId) {
			flush();
			result.push({ kind: 'unread', key: `u-${m.id}` });
			unreadInserted = true;
		}

		if (m.call) {
			flush();
			result.push({ kind: 'call', key: `c-${m.id}`, message: m });
		} else if (group && continuesGroup(group[group.length - 1], m)) {
			group.push(m);
		} else {
			flush();
			group = [m];
		}
	}
	flush();
	return result;
}
