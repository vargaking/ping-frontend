<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import AccountSettings from './AccountSettings.svelte';
	import NotificationSettings from './NotificationSettings.svelte';
	import VoiceSettings from './VoiceSettings.svelte';
	import ServerSettings from './ServerSettings.svelte';
	import ServerInvites from './ServerInvites.svelte';
	import ServerMembers from './ServerMembers.svelte';
	import ChannelSettings from './ChannelSettings.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { Permission } from '$lib/permissions';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import { deleteServer } from '$lib/requests/servers/deleteServer';
	import { getErrorMessage } from '$lib/requests/errors';
	import { serverRemoved } from '$lib/utils/serverRemoved';
	import * as Dialog from '$lib/components/ui/dialog/index';
	import Button from '$lib/components/ui/button/button.svelte';
	import { toast } from 'svelte-sonner';
	import { Trash2, X } from 'lucide-svelte';

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
			out.push({
				scope: 'channel',
				label: `#${channel.name}`,
				tabs: [
					{
						id: 'channel-general',
						label: 'Channel overview',
						scope: 'channel',
						form: true,
						render: channelOverview
					}
				]
			});
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
			if (serversState.canInvite) {
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

	// Land on the first tab of the requested scope, and fall back whenever the
	// active tab disappears (e.g. the channel was deleted).
	$effect(() => {
		if (tabs.some((t) => t.id === activeTabId)) return;
		const target =
			tabs.find((t) => t.id === initialTab) ?? tabs.find((t) => t.scope === category) ?? tabs[0];
		activeTabId = target?.id ?? '';
	});

	const currentTab = $derived(tabs.find((t) => t.id === activeTabId) ?? tabs[0]);

	let deleteOpen = $state(false);
	let deleting = $state(false);

	async function handleDeleteServer() {
		const target = server;
		if (target?.id == null || deleting) return;
		deleting = true;
		try {
			await deleteServer(target.id);
		} catch (e) {
			toast.error(`Couldn't delete the server: ${getErrorMessage(e)}`);
			deleting = false;
			return;
		}
		deleteOpen = false;
		overlayState.close();
		await serverRemoved(target.id);
		toast.success(`Deleted ${target.name}`);
	}
</script>

{#snippet channelOverview()}
	{#if channelId != null}
		<ChannelSettings {channelId} />
	{/if}
{/snippet}
{#snippet serverOverview()}
	<ServerSettings />
{/snippet}
{#snippet serverInvites()}
	<ServerInvites />
{/snippet}
{#snippet serverMembers()}
	<ServerMembers
		onInvite={serversState.canInvite ? () => (activeTabId = 'server-invites') : undefined}
	/>
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
						{#if section.scope === 'server' && server?.server_profile?.icon}
							<img
								src={server.server_profile.icon}
								alt=""
								class="h-4 w-4 shrink-0 rounded object-cover"
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

		{#if server && serversState.isSelectedServerOwner}
			<div class="border-t border-border p-2">
				<Dialog.Root bind:open={deleteOpen}>
					<Dialog.Trigger
						class="flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						<Trash2 size={16} strokeWidth={1.75} />
						Delete server
					</Dialog.Trigger>
					<Dialog.Content>
						<Dialog.Header>
							<Dialog.Title>Delete {server.name}?</Dialog.Title>
							<Dialog.Description>
								This permanently deletes the server with all of its channels and messages for every
								member. It can't be undone.
							</Dialog.Description>
						</Dialog.Header>
						<Dialog.Footer>
							<Button variant="secondary" onclick={() => (deleteOpen = false)}>Cancel</Button>
							<Button
								class="border border-destructive-border bg-transparent text-destructive hover:bg-destructive/10"
								disabled={deleting}
								onclick={handleDeleteServer}
							>
								{deleting ? 'Deleting…' : 'Delete server'}
							</Button>
						</Dialog.Footer>
					</Dialog.Content>
				</Dialog.Root>
			</div>
		{/if}
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
