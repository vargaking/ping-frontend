<script lang="ts">
	import { fade } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { serversState } from '$lib/states/serversState.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { conversationsState } from '$lib/states/conversationsState.svelte';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import { canKickMember, kickMember } from '$lib/utils/kickMember';
	import { getErrorMessage } from '$lib/requests/errors';
	import {
		assignableRoles,
		canAssign,
		canChangeRolesOf,
		setMemberRole
	} from '$lib/utils/memberRoles';
	import type { ServerMember } from '$lib/types/server.types';
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import * as Dialog from '$lib/components/ui/dialog/index';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index';
	import Button from '$lib/components/ui/button/button.svelte';
	import RoleBadge from './RoleBadge.svelte';
	import LoadingList from '$lib/components/ui/feedback/LoadingList.svelte';
	import ErrorState from '$lib/components/ui/feedback/ErrorState.svelte';
	import { EllipsisVertical, LogOut, MessageSquare, Search, Shield } from 'lucide-svelte';

	let { onInvite }: { onInvite?: () => void } = $props();

	const serverId = $derived(serversState.selectedServer?.id);
	const myId = $derived(usersState.loggedInUser?.id);
	// Changes when someone joins or leaves over the socket, which refetches.
	const memberCount = $derived(serversState.selectedServer?.members?.length ?? 0);

	let members = $state<ServerMember[]>([]);
	let isLoading = $state(true);
	let loadError = $state(false);
	let query = $state('');

	let kickTarget = $state<Row | null>(null);
	let kicking = $state(false);

	const joinedFormat = new Intl.DateTimeFormat('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});

	const rows = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		return members
			.map((m) => ({
				...m,
				user: usersState.users[m.user.id] ?? m.user,
				roleIds: serverId != null ? (serversState.memberRoles[serverId]?.[m.user.id] ?? []) : []
			}))
			.filter((m) => !needle || m.user.username.toLowerCase().includes(needle));
	});

	$effect(() => {
		void memberCount;
		if (serverId != null) fetchMembers(serverId);
	});

	async function fetchMembers(id: number) {
		loadError = false;
		try {
			const fetched = await serversState.loadRoster(id);
			if (id === serverId) members = fetched;
		} catch (e) {
			console.error('Failed to fetch members', e);
			loadError = true;
		} finally {
			isLoading = false;
		}
	}

	type Row = (typeof rows)[number];

	function canKick(member: Row) {
		return serverId != null && canKickMember(serverId, member.user.id);
	}

	function canChangeRole(member: Row) {
		return serverId != null && canChangeRolesOf(serverId, member.user.id);
	}

	async function message(member: Row) {
		try {
			const conversation = await conversationsState.openWith(member.user.id);
			overlayState.close();
			await goto(`/app/direct/${conversation.id}/`);
		} catch (e) {
			toast.error(getErrorMessage(e));
		}
	}

	async function kick() {
		const target = kickTarget;
		if (!target || serverId == null || kicking) return;
		kicking = true;
		try {
			if (await kickMember(serverId, target.user)) {
				members = members.filter((m) => m.user.id !== target.user.id);
				kickTarget = null;
			}
		} finally {
			kicking = false;
		}
	}
</script>

<div class="flex flex-col gap-4" in:fade={{ duration: 150 }}>
	<div class="flex items-center gap-3">
		<label
			class="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-input bg-surface-input px-3 focus-within:border-ring"
		>
			<span class="sr-only">Search members</span>
			<Search size={16} strokeWidth={1.75} class="shrink-0 text-text-subtle" />
			<input
				type="search"
				bind:value={query}
				placeholder="Search members"
				class="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-text-subtle focus:ring-0"
			/>
		</label>
		{#if onInvite}
			<Button variant="secondary" class="h-10 rounded-[10px]" onclick={onInvite}
				>Invite people</Button
			>
		{/if}
	</div>

	{#if isLoading}
		<LoadingList rows={3} />
	{:else if loadError}
		<ErrorState
			title="Couldn’t load members"
			description="There was a problem reaching the server."
			onRetry={() => serverId != null && fetchMembers(serverId)}
		/>
	{:else}
		<div role="table" aria-label="Members" class="flex flex-col">
			<div
				role="row"
				class="grid grid-cols-[1fr_minmax(140px,1.3fr)_100px_36px] gap-3 border-b border-border px-3 pb-2 text-xs font-medium tracking-[0.02em] text-text-subtle"
			>
				<span role="columnheader">Member</span>
				<span role="columnheader">Role</span>
				<span role="columnheader">Joined</span>
				<span role="columnheader"><span class="sr-only">Actions</span></span>
			</div>

			{#each rows as member (member.user.id)}
				{@const online = usersState.onlineUsers.has(member.user.id)}
				{@const isMe = member.user.id === myId}
				<div
					role="row"
					class="group grid min-h-14 grid-cols-[1fr_minmax(140px,1.3fr)_100px_36px] items-center gap-3 rounded-lg px-3 py-2 focus-within:bg-card hover:bg-card"
				>
					<span role="cell" class="flex min-w-0 items-center gap-3">
						<span class="relative shrink-0">
							<Avatar user={member.user} size="sm" rounded="rounded-[9px]" />
							<span
								class="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background {online
									? 'bg-online'
									: 'bg-offline'}"
							></span>
							<span class="sr-only">{online ? 'Online' : 'Offline'}</span>
						</span>
						<span class="flex min-w-0 flex-col">
							<span
								class="truncate text-sm font-medium {online ? '' : 'text-muted-foreground'}"
								style:color={serversState.nameColorOf(serverId, member.user.id)}
							>
								{member.user.username}
							</span>
							{#if isMe}
								<span class="font-mono text-[11px] text-text-subtle">you</span>
							{/if}
						</span>
					</span>
					<span role="cell">
						{#if member.is_owner}
							<span class="rounded-md bg-primary/15 px-2 py-[3px] text-xs font-medium text-primary">
								Owner
							</span>
						{:else if member.roleIds.length === 0}
							<span class="text-[13px] text-muted-foreground">Member</span>
						{:else}
							<span class="flex flex-wrap gap-1">
								{#each serversState.rolesOf(serverId ?? -1, member.user.id) as role (role.id)}
									<RoleBadge name={role.name} color={role.color} />
								{/each}
							</span>
						{/if}
					</span>
					<span role="cell" class="font-mono text-xs text-muted-foreground">
						{joinedFormat.format(new Date(member.joined_at))}
					</span>
					<span role="cell">
						{#if canKick(member) || canChangeRole(member)}
							<DropdownMenu.Root>
								<DropdownMenu.Trigger
									aria-label="Actions for {member.user.username}"
									class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-colors group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-accent data-[state=open]:opacity-100"
								>
									<EllipsisVertical size={16} strokeWidth={2} />
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end" class="w-48">
									<DropdownMenu.Item onclick={() => message(member)}>
										<MessageSquare size={16} strokeWidth={1.75} />
										Message
									</DropdownMenu.Item>
									<DropdownMenu.Separator />
									{#if serverId != null && canChangeRole(member)}
										<DropdownMenu.Sub>
											<DropdownMenu.SubTrigger>
												<Shield size={16} strokeWidth={1.75} />
												Roles
											</DropdownMenu.SubTrigger>
											<DropdownMenu.SubContent class="w-48">
												{#each assignableRoles(serverId) as role (role.id)}
													<DropdownMenu.CheckboxItem
														checked={member.roleIds.includes(role.id)}
														disabled={!canAssign(serverId, role)}
														closeOnSelect={false}
														onCheckedChange={(assigned) =>
															setMemberRole(serverId, member.user, role, assigned)}
													>
														<span
															aria-hidden="true"
															class="h-2 w-2 shrink-0 rounded-full {role.color
																? ''
																: 'bg-text-subtle'}"
															style:background-color={role.color}
														></span>
														<span class="truncate">{role.name}</span>
													</DropdownMenu.CheckboxItem>
												{/each}
											</DropdownMenu.SubContent>
										</DropdownMenu.Sub>
									{/if}
									{#if canKick(member)}
										<DropdownMenu.Item variant="destructive" onclick={() => (kickTarget = member)}>
											<LogOut size={16} strokeWidth={1.75} />
											Kick from server
										</DropdownMenu.Item>
									{/if}
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						{/if}
					</span>
				</div>
			{:else}
				<p class="px-3 py-6 text-sm text-text-subtle">No members match “{query.trim()}”.</p>
			{/each}
		</div>
	{/if}
</div>

<Dialog.Root
	open={kickTarget != null}
	onOpenChange={(open) => {
		if (!open && !kicking) kickTarget = null;
	}}
>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Kick {kickTarget?.user.username}?</Dialog.Title>
			<Dialog.Description>
				They'll lose access to this server right away. They can rejoin with a new invite.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="secondary" onclick={() => (kickTarget = null)}>Cancel</Button>
			<Button
				class="border border-destructive-border bg-transparent text-destructive hover:bg-destructive/10"
				disabled={kicking}
				onclick={kick}
			>
				{kicking ? 'Kicking…' : 'Kick'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
