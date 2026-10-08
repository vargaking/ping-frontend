import { usersState } from './usersState.svelte';

const keyFor = (userId: number) => `collapsedChannelGroups:${userId}`;

function load(userId: number): number[] {
	try {
		const saved = JSON.parse(localStorage.getItem(keyFor(userId)) ?? '[]');
		return Array.isArray(saved) ? saved.filter((id) => Number.isInteger(id)) : [];
	} catch {
		return [];
	}
}

/** Which channel categories the logged-in user has folded away, remembered per user. */
class CollapsedGroupsState {
	private edited: { userId: number; ids: number[] } | null = $state(null);

	private ids: number[] = $derived.by(() => {
		const userId = usersState.loggedInUser?.id;
		if (userId == null) return [];
		return this.edited?.userId === userId ? this.edited.ids : load(userId);
	});

	isCollapsed(groupId: number): boolean {
		return this.ids.includes(groupId);
	}

	toggle(groupId: number) {
		const userId = usersState.loggedInUser?.id;
		if (userId == null) return;
		const ids = this.ids.includes(groupId)
			? this.ids.filter((id) => id !== groupId)
			: [...this.ids, groupId];
		this.edited = { userId, ids };
		try {
			localStorage.setItem(keyFor(userId), JSON.stringify(ids));
		} catch {
			/* storage unavailable: the choice lasts until reload */
		}
	}
}

export const collapsedGroupsState = new CollapsedGroupsState();
