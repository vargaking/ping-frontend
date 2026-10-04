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
	import ChannelSettings from './ChannelSettings.svelte';
	import ForumTagsSettings from './ForumTagsSettings.svelte';
	import { forumState } from '$lib/states/forumState.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { Permission } from '$lib/permissions';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import { X } from 'lucide-svelte';

	type Category = 'account' | 'server' | 'channel';

	let {
		category = 'account',
		channelId = null,
		tab: initialTab = null
	}: {
		category?: Category;
		channelId?: number | null;
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

	const sections = $derived.by<Section[]>(() => {
		const out: Section[] = [];

		if (channel && serversState.can(Permission.MANAGE_CHANNELS)) {
			const channelTabs: Tab[] = [
				{
					id: 'channel-general',
					label: 'Channel overview',
					scope: 'channel',
					form: true,
					render: channelOverview
				}
			];
			if (channel.type === 'forum') {
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
{#snippet account()}
	<AccountSettings />
{/snippet}
{#snippet voice()}
	<VoiceSettings />
{/snippet}
{#snippet notifications()}
	<NotificationSettings />
{/snippet}

<div
	class="flex h-[min(680px,90vh)] w-[min(960px,90vw)] overflow-hidden rounded-xl border border-input bg-background text-foreground"
>
	<nav aria-label="Settings" class="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
		<div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-2 py-4 scrollbar-stable">
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
							onclick={() => (activeTabId = tab.id)}
							class="flex h-9 items-center rounded-lg px-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {tab.id ===
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

	<div class="flex min-w-0 flex-1 flex-col">
		<header class="flex h-14 shrink-0 items-center border-b border-border pr-3 pl-7">
			<h1 class="text-[15px] font-semibold">{currentTab?.label}</h1>
			<button
				type="button"
				aria-label="Close settings"
				onclick={() => overlayState.close()}
				class="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				<X size={18} strokeWidth={1.75} />
			</button>
		</header>

		{#if currentTab}
			{#key currentTab.id}
				{#if currentTab.form}
					{@render currentTab.render()}
				{:else}
					<div class="min-h-0 flex-1 overflow-y-auto p-7 scrollbar-stable">
						{@render currentTab.render()}
					</div>
				{/if}
			{/key}
		{/if}
	</div>
</div>

<InviteDialog bind:open={inviteOpen} />
