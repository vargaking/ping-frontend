<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import AccountSettings from './AccountSettings.svelte';
	import NotificationSettings from './NotificationSettings.svelte';
	import VoiceSettings from './VoiceSettings.svelte';
	import ServerSettings from './ServerSettings.svelte';
	import ServerIcon from '$lib/components/ui/avatar/ServerIcon.svelte';
	import InviteDialog from '$lib/components/servers/InviteDialog.svelte';
	import ServerInvites from './ServerInvites.svelte';
	import ServerMembers from './ServerMembers.svelte';
	import RolesSettings from './RolesSettings.svelte';
	import ServerImport from './ServerImport.svelte';
	import ChannelSettings from './ChannelSettings.svelte';
	import ChannelPermissions from './ChannelPermissions.svelte';
	import CategorySettings from './CategorySettings.svelte';
	import ForumTagsSettings from './ForumTagsSettings.svelte';
	import { forumState } from '$lib/states/forumState.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { Permission } from '$lib/permissions';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import { ArrowLeft, X } from 'lucide-svelte';

	type Category = 'account' | 'server' | 'channel' | 'category';

	let {
		category = 'account',
		channelId = null,
		groupId = null,
		tab: initialTab = null
	}: {
		category?: Category;
		channelId?: number | null;
		groupId?: number | null;
		/** Open on a specific tab id instead of the scope's first tab. */
		tab?: string | null;
	} = $props();

	type Tab = {
		id: string;
		label: string;
		scope: Category;
		/** Form panels bring their own padding and sticky save footer. */
		form?: boolean;
		count?: number;
		render: Snippet;
	};
	type Section = { scope: Category; label: string; tabs: Tab[] };

	// The server tabs only make sense while a server is open, not on DM pages.
	const server = $derived(page.params.serverId ? serversState.selectedServer : null);
	const channel = $derived(
		channelId != null ? (serversState.selectedServerChannels[channelId] ?? null) : null
	);

	const group = $derived(
		groupId != null
			? (serversState.selectedServerLayout.groups.find((g) => g.group.id === groupId)?.group ??
					null)
			: null
	);
	const canManageChannels = $derived(serversState.can(Permission.MANAGE_CHANNELS));
	const canManageRoles = $derived(serversState.can(Permission.MANAGE_ROLES));

	const sections = $derived.by<Section[]>(() => {
		const out: Section[] = [];

		if (group && (canManageChannels || canManageRoles)) {
			const groupTabs: Tab[] = [];
			if (canManageChannels) {
				groupTabs.push({
					id: 'category-general',
					label: 'Category overview',
					scope: 'category',
					form: true,
					render: categoryOverview
				});
			}
			if (canManageRoles) {
				groupTabs.push({
					id: 'category-permissions',
					label: 'Permissions',
					scope: 'category',
					render: categoryPermissions
				});
			}
			out.push({ scope: 'category', label: group.name, tabs: groupTabs });
		}

		if (channel && (canManageChannels || canManageRoles)) {
			const channelTabs: Tab[] = [];
			if (canManageChannels) {
				channelTabs.push({
					id: 'channel-general',
					label: 'Channel overview',
					scope: 'channel',
					form: true,
					render: channelOverview
				});
			}
			if (canManageRoles) {
				channelTabs.push({
					id: 'channel-permissions',
					label: 'Permissions',
					scope: 'channel',
					render: channelPermissions
				});
			}
			if (channel.type === 'forum' && canManageChannels) {
				channelTabs.push({
					id: 'channel-tags',
					label: 'Tags',
					scope: 'channel',
					count: forumState.tags(channel.id).length,
					render: forumTags
				});
			}
			out.push({ scope: 'channel', label: `#${channel.name}`, tabs: channelTabs });
		}

		if (server) {
			const tabs: Tab[] = [];
			if (serversState.can(Permission.MANAGE_SERVER)) {
				tabs.push({
					id: 'server-general',
					label: 'Overview',
					scope: 'server',
					form: true,
					render: serverOverview
				});
			}
			if (serversState.can(Permission.MANAGE_INVITES) || serversState.canInvite) {
				tabs.push({
					id: 'server-invites',
					label: 'Invites',
					scope: 'server',
					render: serverInvites
				});
			}
			tabs.push({
				id: 'server-members',
				label: 'Members',
				scope: 'server',
				count: server.members?.length,
				render: serverMembers
			});
			if (serversState.can(Permission.MANAGE_ROLES)) {
				tabs.push({
					id: 'server-roles',
					label: 'Roles',
					scope: 'server',
					form: true,
					render: serverRoles
				});
			}
			if (serversState.isSelectedServerOwner) {
				tabs.push({
					id: 'server-import',
					label: 'Import',
					scope: 'server',
					render: serverImport
				});
			}
			out.push({ scope: 'server', label: server.name, tabs });
		}

		out.push({
			scope: 'account',
			label: 'Account',
			tabs: [
				{
					id: 'account-general',
					label: 'My account',
					scope: 'account',
					form: true,
					render: account
				},
				{
					id: 'account-voice',
					label: 'Voice',
					scope: 'account',
					render: voice
				},
				{
					id: 'account-notifications',
					label: 'Notifications',
					scope: 'account',
					render: notifications
				}
			]
		});

		return out;
	});

	const tabs = $derived(sections.flatMap((s) => s.tabs));

	let activeTabId = $state('');
	let inviteOpen = $state(false);
	// A phone shows either the tab list or one tab; it opens on the requested tab.
	let phoneShowsList = $state(false);

	// Land on the first tab of the requested scope, and fall back whenever the
	// active tab disappears (e.g. the channel was deleted).
	$effect(() => {
		if (tabs.some((t) => t.id === activeTabId)) return;
		const target =
			tabs.find((t) => t.id === initialTab) ?? tabs.find((t) => t.scope === category) ?? tabs[0];
		activeTabId = target?.id ?? '';
	});

	const currentTab = $derived(tabs.find((t) => t.id === activeTabId) ?? tabs[0]);
</script>

{#snippet channelOverview()}
	{#if channelId != null}
		<ChannelSettings {channelId} />
	{/if}
{/snippet}
{#snippet channelPermissions()}
	{#if channel && serversState.selectedServerId != null}
		<ChannelPermissions
			serverId={serversState.selectedServerId}
			target={{ kind: 'channel', id: channel.id }}
			categoryId={channel.group_id}
		/>
	{/if}
{/snippet}
{#snippet categoryOverview()}
	{#if groupId != null}
		<CategorySettings {groupId} />
	{/if}
{/snippet}
{#snippet categoryPermissions()}
	{#if groupId != null && serversState.selectedServerId != null}
		<ChannelPermissions
			serverId={serversState.selectedServerId}
			target={{ kind: 'group', id: groupId }}
		/>
	{/if}
{/snippet}
{#snippet forumTags()}
	{#if channelId != null}
		<ForumTagsSettings {channelId} />
	{/if}
{/snippet}
{#snippet serverOverview()}
	<ServerSettings />
{/snippet}
{#snippet serverInvites()}
	<ServerInvites />
{/snippet}
{#snippet serverMembers()}
	<ServerMembers onInvite={serversState.canInvite ? () => (inviteOpen = true) : undefined} />
{/snippet}
{#snippet serverRoles()}
	<RolesSettings />
{/snippet}
{#snippet serverImport()}
	<ServerImport />
{/snippet}
{#snippet account()}
	<AccountSettings />
{/snippet}
{#snippet voice()}
	<VoiceSettings />
{/snippet}
{#snippet notifications()}
	<NotificationSettings />
{/snippet}

{#snippet closeButton()}
	<button
		type="button"
		aria-label="Close settings"
		onclick={() => overlayState.close()}
		class="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:h-11 pointer-coarse:w-11"
	>
		<X size={18} strokeWidth={1.75} />
	</button>
{/snippet}

<div
	data-fullscreen
	class="flex h-[min(680px,90vh)] w-[min(960px,90vw)] overflow-hidden rounded-xl border border-input bg-background text-foreground max-md:h-[var(--app-height,100dvh)] max-md:w-screen max-md:rounded-none max-md:border-0 max-md:pt-[env(safe-area-inset-top,0px)] max-md:pr-[env(safe-area-inset-right,0px)] max-md:pb-[var(--safe-bottom)] max-md:pl-[env(safe-area-inset-left,0px)]"
>
	<nav
		aria-label="Settings"
		class="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar max-md:w-full max-md:border-r-0 {phoneShowsList
			? ''
			: 'max-md:hidden'}"
	>
		<header
			class="hidden h-12 shrink-0 items-center border-b border-border pr-1.5 pl-4 max-md:flex"
		>
			<h1 class="text-[15px] font-semibold">Settings</h1>
			{@render closeButton()}
		</header>
		<div
			class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-2 py-4 scrollbar-stable max-md:px-3"
		>
			{#each sections as section (section.scope)}
				<div class="flex flex-col gap-0.5">
					<h2
						class="flex items-center gap-2 px-2 pb-1 text-xs font-medium tracking-[0.02em] text-text-subtle"
					>
						{#if section.scope === 'server' && server}
							<ServerIcon
								name={server.name}
								serverId={server.id ?? server.name}
								iconUrl={server.server_profile?.icon ?? null}
								iconText={server.icon_text}
								iconTone={server.icon_tone}
								class="h-4 w-4 rounded text-[8px]"
							/>
						{/if}
						<span class="truncate">{section.label}</span>
					</h2>
					{#each section.tabs as tab (tab.id)}
						<button
							type="button"
							aria-current={tab.id === currentTab?.id ? 'page' : undefined}
							onclick={() => {
								activeTabId = tab.id;
								phoneShowsList = false;
							}}
							class="flex h-9 items-center rounded-lg px-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-md:h-12 max-md:text-[15px] {tab.id ===
							currentTab?.id
								? 'bg-accent font-medium text-foreground'
								: 'text-muted-foreground hover:bg-card hover:text-foreground'}"
						>
							<span class="flex-1">{tab.label}</span>
							{#if tab.count != null}
								<span class="font-mono text-[11px] text-text-subtle">{tab.count}</span>
							{/if}
						</button>
					{/each}
				</div>
			{/each}
		</div>
	</nav>

	<div class="flex min-w-0 flex-1 flex-col {phoneShowsList ? 'max-md:hidden' : ''}">
		<header
			class="flex h-14 shrink-0 items-center border-b border-border pr-3 pl-7 max-md:h-12 max-md:gap-1 max-md:pr-1.5 max-md:pl-1.5"
		>
			<button
				type="button"
				aria-label="Back to settings"
				onclick={() => (phoneShowsList = true)}
				class="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-md:flex pointer-coarse:h-11 pointer-coarse:w-11"
			>
				<ArrowLeft size={18} strokeWidth={1.75} />
			</button>
			<h1 class="min-w-0 truncate text-[15px] font-semibold">{currentTab?.label}</h1>
			{@render closeButton()}
		</header>

		{#if currentTab}
			{#key currentTab.id}
				{#if currentTab.form}
					{@render currentTab.render()}
				{:else}
					<div class="min-h-0 flex-1 overflow-y-auto p-7 scrollbar-stable max-md:p-4">
						{@render currentTab.render()}
					</div>
				{/if}
			{/key}
		{/if}
	</div>
</div>

<InviteDialog bind:open={inviteOpen} />
