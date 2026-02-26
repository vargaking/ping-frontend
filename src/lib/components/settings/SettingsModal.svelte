<script lang="ts">
	import AccountSettings from './AccountSettings.svelte';
	import ServerSettings from './ServerSettings.svelte';
	import ServerInvites from './ServerInvites.svelte';
	import ServerMembers from './ServerMembers.svelte';
	import ChannelSettings from './ChannelSettings.svelte';
	import { serversState } from '$lib/states/serversState.svelte';

	let { category = 'account' }: { category?: 'account' | 'server' | 'channel' } = $props();

	const tabsByCategory = {
		account: [
			{
				id: 'account-general',
				label: 'My Account',
				component: AccountSettings,
				condition: () => true
			}
		],
		server: [
			{
				id: 'server-general',
				label: 'Overview',
				component: ServerSettings,
				condition: () => serversState.selectedServer !== null
			},
			{
				id: 'server-invites',
				label: 'Invites',
				component: ServerInvites,
				condition: () => serversState.selectedServer !== null
			},
			{
				id: 'server-members',
				label: 'Members',
				component: ServerMembers,
				condition: () => serversState.selectedServer !== null
			}
		],
		channel: [
			{
				id: 'channel-general',
				label: 'Overview',
				component: ChannelSettings,
				condition: () => serversState.selectedChannel !== null
			}
		]
	};

	let availableTabs = $derived(
		(tabsByCategory[category] || []).filter((tab) => !tab.condition || tab.condition())
	);

	let activeTabId = $state('');

	// Ensure there is an active tab ID set immediately, or when category changes
	$effect(() => {
		if (availableTabs.length > 0 && !availableTabs.find((t) => t.id === activeTabId)) {
			activeTabId = availableTabs[0].id;
		}
	});

	let currentTab = $derived(availableTabs.find((t) => t.id === activeTabId) || availableTabs[0]);
	let CurrentComponent = $derived(currentTab?.component);
</script>

<div class="flex h-[600px] w-[800px] overflow-hidden rounded-lg bg-[#1e1e1e] text-white">
	<!-- Sidebar -->
	<div class="flex w-1/4 flex-col gap-2 overflow-y-auto bg-[#2b2d31] p-4">
		<h2 class="mb-2 px-1 text-xs font-bold tracking-widest text-gray-400 uppercase">
			{#if category === 'account'}
				User Settings
			{:else if category === 'server'}
				Server Settings
			{:else}
				Channel Settings
			{/if}
		</h2>
		{#each availableTabs as tab}
			<button
				class="rounded px-3 py-1.5 text-left text-sm font-medium transition-colors {activeTabId ===
				tab.id
					? 'bg-[#404249] text-white'
					: 'text-gray-400 hover:bg-[#35373c] hover:text-gray-200'}"
				onclick={() => {
					activeTabId = tab.id;
				}}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	<!-- Content -->
	<div class="flex-1 overflow-y-auto bg-[#313338] p-8">
		{#if CurrentComponent}
			<CurrentComponent />
		{/if}
	</div>
</div>
