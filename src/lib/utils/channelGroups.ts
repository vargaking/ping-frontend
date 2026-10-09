import { toast } from 'svelte-sonner';
import ChannelGroupNameDialog from '$lib/components/servers/ChannelGroupNameDialog.svelte';
import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
import { createChannelGroup } from '$lib/requests/channels/createChannelGroup';
import { deleteChannelGroup } from '$lib/requests/channels/deleteChannelGroup';
import { getErrorMessage } from '$lib/requests/errors';
import { renameChannelGroup } from '$lib/requests/channels/renameChannelGroup';
import { overlayState } from '$lib/states/overlayState.svelte';
import { serversState } from '$lib/states/serversState.svelte';
import type { ServerLayout } from '$lib/states/serversState.svelte';
import type { ChannelGroup, ChannelLayout } from '$lib/types/channel.types';

export function layoutIds(layout: ServerLayout): ChannelLayout {
	return {
		ungrouped: layout.ungrouped.map((c) => c.id),
		groups: layout.groups.map((g) => ({ id: g.group.id, channel_ids: g.channels.map((c) => c.id) }))
	};
}

export function promptCreateGroup(serverId: number) {
	overlayState.open(ChannelGroupNameDialog, {
		title: 'Create a category',
		confirmLabel: 'Create',
		onSubmit: async (name: string) => {
			serversState.addGroup(serverId, await createChannelGroup(serverId, name));
		}
	});
}

export function promptRenameGroup(group: ChannelGroup) {
	overlayState.open(ChannelGroupNameDialog, {
		title: 'Rename category',
		confirmLabel: 'Rename',
		initialName: group.name,
		onSubmit: async (name: string) => {
			serversState.updateGroup(
				group.server_id,
				await renameChannelGroup(group.server_id, group.id, name)
			);
		}
	});
}

export function confirmDeleteGroup(group: ChannelGroup) {
	overlayState.open(ConfirmDialog, {
		title: `Delete ${group.name}?`,
		description: 'Its channels move to the top of the list. No channels or messages are deleted.',
		confirmLabel: 'Delete category',
		destructive: true,
		onConfirm: () => deleteGroup(group)
	});
}

/** Delete a category; its channels move to the end of the ungrouped list. */
export async function deleteGroup(group: ChannelGroup) {
	try {
		await deleteChannelGroup(group.server_id, group.id);
	} catch (e) {
		toast.error(`Couldn't delete category: ${getErrorMessage(e)}`);
		return;
	}
	const ids = layoutIds(serversState.selectedServerLayout);
	const moved = ids.groups.find((g) => g.id === group.id)?.channel_ids ?? [];
	serversState.removeGroup(group.server_id, group.id, {
		ungrouped: [...ids.ungrouped, ...moved],
		groups: ids.groups.filter((g) => g.id !== group.id)
	});
}

export type ChannelDrop =
	| { kind: 'channel'; id: number; edge: 'before' | 'after' }
	| { kind: 'group'; id: number }
	| { kind: 'ungrouped' };

export type GroupDrop = { id: number; edge: 'before' | 'after' };

const sameLayout = (a: ChannelLayout, b: ChannelLayout) => JSON.stringify(a) === JSON.stringify(b);

/** The layout after dropping a channel, or null when nothing would change. */
export function moveChannel(
	layout: ChannelLayout,
	channelId: number,
	drop: ChannelDrop
): ChannelLayout | null {
	const without = (ids: number[]) => ids.filter((id) => id !== channelId);
	const next: ChannelLayout = {
		ungrouped: without(layout.ungrouped),
		groups: layout.groups.map((g) => ({ id: g.id, channel_ids: without(g.channel_ids) }))
	};

	if (drop.kind === 'ungrouped') {
		next.ungrouped.push(channelId);
	} else if (drop.kind === 'group') {
		next.groups.find((g) => g.id === drop.id)?.channel_ids.push(channelId);
	} else {
		const list = [next.ungrouped, ...next.groups.map((g) => g.channel_ids)].find((ids) =>
			ids.includes(drop.id)
		);
		if (!list) return null;
		list.splice(list.indexOf(drop.id) + (drop.edge === 'after' ? 1 : 0), 0, channelId);
	}
	return sameLayout(layout, next) ? null : next;
}

/** The layout after dropping a category next to another, or null when nothing would change. */
export function moveGroup(
	layout: ChannelLayout,
	groupId: number,
	drop: GroupDrop
): ChannelLayout | null {
	const moved = layout.groups.find((g) => g.id === groupId);
	if (!moved || drop.id === groupId) return null;
	const groups = layout.groups.filter((g) => g.id !== groupId);
	const at = groups.findIndex((g) => g.id === drop.id);
	if (at < 0) return null;
	groups.splice(at + (drop.edge === 'after' ? 1 : 0), 0, moved);
	const next = { ungrouped: layout.ungrouped, groups };
	return sameLayout(layout, next) ? null : next;
}
