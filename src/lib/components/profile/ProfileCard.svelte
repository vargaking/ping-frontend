<script lang="ts">
	import { Ellipsis, MessageSquare, Pencil } from 'lucide-svelte';
	import { page } from '$app/state';
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index';
	import ActionDropdownItems from '$lib/components/ui/dropdown-menu/ActionDropdownItems.svelte';
	import FriendButton from '$lib/components/friends/FriendButton.svelte';
	import SettingsModal from '$lib/components/settings/SettingsModal.svelte';
	import { conversationsState } from '$lib/states/conversationsState.svelte';
	import { friendsState } from '$lib/states/friendsState.svelte';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import type { ProfileCardTarget } from '$lib/states/profileCardState.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { friendCardActions } from '$lib/utils/friendActions';
	import { avatarToneClass } from '$lib/utils/avatar';
	import { openDirectMessage, profileCardActions } from '$lib/utils/menuActions';
	import { bannerOf, cardStatus, closingFirst } from '$lib/utils/profileCard';
	import ProfileBanner from './ProfileBanner.svelte';

	let { target, onclose }: { target: ProfileCardTarget; onclose: () => void } = $props();

	const userId = $derived(target.kind === 'user' ? target.userId : null);
	const serverId = $derived(target.kind === 'user' ? target.serverId : null);

	let missing = $state(false);

	$effect(() => {
		const id = userId;
		missing = false;
		if (id == null) return;
		let stale = false;
		usersState
			.getOrFetchUser(id)
			.then((fetched) => {
				if (!stale && fetched === null) missing = true;
			})
			.catch(() => {
				if (!stale) missing = true;
			});
		return () => {
			stale = true;
		};
	});

	const user = $derived(
		userId == null ? null : (usersState.users[userId] ?? (missing ? null : undefined))
	);
	const memberIds = $derived(
		serverId == null ? null : (serversState.servers[serverId]?.members?.map((m) => m.id) ?? null)
	);
	const status = $derived(
		cardStatus({ imported: target.kind === 'imported', userId, user, serverId, memberIds })
	);

	const isMe = $derived(userId != null && usersState.loggedInUser?.id === userId);
	const conversationId = $derived(Number.parseInt(page.params.conversationId ?? '', 10));
	const inThisDm = $derived(
		Number.isInteger(conversationId) &&
			userId != null &&
			conversationsState.conversations[conversationId]?.other_user.id === userId
	);

	const name = $derived(
		user?.username ?? (target.kind === 'imported' ? target.name : target.fallbackName) ?? '…'
	);
	const banner = $derived(bannerOf(user?.profile));
	const tone = $derived(avatarToneClass(user?.id ?? name));
	const online = $derived(userId != null && status !== 'left' && usersState.isOnline(userId));
	const statusLine = $derived(
		status === 'left'
			? 'No longer in this server'
			: status === 'imported'
				? 'Imported from Discord'
				: status === 'missing'
					? 'Account not found'
					: null
	);

	const acting = $derived(user != null && (status === 'member' || status === 'direct'));
	const roles = $derived(
		status === 'member' && serverId != null && userId != null
			? serversState.rolesOf(serverId, userId)
			: []
	);
	const joinedAt = $derived(
		status === 'member' && serverId != null && userId != null
			? serversState.joinedAtOf(serverId, userId)
			: null
	);
	const joinedLabel = $derived(
		joinedAt
			? new Date(joinedAt).toLocaleDateString([], {
					year: 'numeric',
					month: 'short',
					day: 'numeric'
				})
			: null
	);
	const overflow = $derived(
		acting && user
			? closingFirst([...profileCardActions(serverId, user), ...friendCardActions(user)], onclose)
			: []
	);

	function message() {
		// Closing clears the target this card's userId comes from.
		const id = userId;
		if (id == null) return;
		onclose();
		void openDirectMessage(id);
	}

	function editProfile() {
		onclose();
		overlayState.open(SettingsModal, { category: 'account', tab: 'account-general' });
	}
</script>

<div class="flex w-full min-w-0 flex-col" data-profile-card>
	<ProfileBanner {banner} fallbackClass="{tone} opacity-60" class="h-20 shrink-0" />
	<div class="flex min-w-0 flex-col gap-3 px-4 pb-4">
		<div class="flex items-start justify-between">
			<div class="relative -mt-8 h-16 w-16 shrink-0">
				<Avatar
					{user}
					name={user ? null : name}
					size="xl"
					rounded="rounded-2xl"
					className="h-full! w-full! ring-4 ring-popover"
				/>
				{#if user && status !== 'left'}
					<span
						class="absolute -right-1 -bottom-1 h-3.5 w-3.5 rounded-full ring-[3px] ring-popover {online
							? 'bg-online'
							: 'bg-offline'}"
						aria-hidden="true"
					></span>
					<span class="sr-only">{online ? 'Online' : 'Offline'}</span>
				{/if}
			</div>
			{#if overflow.length > 0}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						aria-label="More actions"
						class="mt-2 -mr-1.5 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-accent pointer-coarse:h-11 pointer-coarse:w-11"
					>
						<Ellipsis size={18} strokeWidth={1.75} />
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-52">
						<ActionDropdownItems actions={overflow} />
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
		</div>

		<div class="min-w-0">
			<h2 id="profile-card-name" class="truncate text-base font-semibold" title={name}>{name}</h2>
			{#if statusLine}
				<p class="text-sm text-text-subtle">{statusLine}</p>
			{/if}
		</div>

		{#if roles.length > 0}
			<ul class="flex flex-wrap gap-1.5" aria-label="Roles">
				{#each roles as role (role.id)}
					<li
						class="flex max-w-full items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs"
					>
						<span
							aria-hidden="true"
							class="h-2 w-2 shrink-0 rounded-full {role.color ? '' : 'bg-text-subtle'}"
							style:background-color={role.color}
						></span>
						<span class="truncate">{role.name}</span>
					</li>
				{/each}
			</ul>
		{/if}

		{#if joinedLabel}
			<p class="text-xs text-text-subtle">Member since {joinedLabel}</p>
		{/if}

		{#if acting && user && (isMe || !inThisDm || friendsState.loaded)}
			<div class="flex gap-2 pt-1 *:min-w-0 *:flex-1">
				{#if isMe}
					<Button variant="secondary" size="sm" onclick={editProfile}>
						<Pencil size={14} strokeWidth={1.75} />
						Edit profile
					</Button>
				{:else}
					{#if !inThisDm}
						<Button size="sm" onclick={message}>
							<MessageSquare size={14} strokeWidth={1.75} />
							Message
						</Button>
					{/if}
					<FriendButton {user} />
				{/if}
			</div>
		{/if}
	</div>
</div>
