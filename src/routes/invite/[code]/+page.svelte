<script lang="ts">
	import { useInvite, getInvite } from '$lib/requests/invites';
	import { getServer } from '$lib/requests/servers/getServer';
	import { serversState } from '$lib/states/serversState.svelte';
	import { goto } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import { page } from '$app/stores';
	import type { InvitePublicResponse } from '$lib/types/invite.types';
	import type { Server } from '$lib/types/server.types';

	let password = $state('');
	let isJoining = $state(false);
	let joinError = $state<string | null>(null);

	let isLoading = $state(true);
	let loadError = $state<string | null>(null);

	let invite = $state<InvitePublicResponse | null>(null);
	let server = $state<Server | null>(null);

	let inviteCode = $derived($page.params.code);

	$effect(() => {
		if (inviteCode) {
			loadInviteData(inviteCode);
		}
	});

	async function loadInviteData(code: string) {
		isLoading = true;
		loadError = null;

		try {
			// Fetch invite details
			invite = await getInvite(code);

			// Fetch server details
			server = await getServer(invite.server_id);
		} catch (e: any) {
			console.error('Failed to load invite data:', e);
			loadError = e?.response?.data?.detail || 'Invite not found or invalid.';
		} finally {
			isLoading = false;
		}
	}

	async function handleJoin() {
		if (!invite || !invite.is_valid) return;

		isJoining = true;
		joinError = null;

		try {
			const result = await useInvite(invite.id, invite.has_password ? { password } : {});

			// If join is successful, immediately fetch user servers to update the state
			await serversState.fetchUserServers();

			// Navigate to the server page
			goto(`/app/server/${result.server_id}`);
		} catch (e: any) {
			console.error('Failed to join server via invite:', e);
			joinError = e?.response?.data?.detail || 'Failed to join the server.';
		} finally {
			isJoining = false;
		}
	}
</script>

<div class="flex h-screen w-full items-center justify-center bg-[#1e1e1e] p-4 text-white">
	<div
		class="flex w-full max-w-sm flex-col items-center gap-6 rounded-lg bg-[#2b2d31] p-8 shadow-xl"
		in:fade={{ duration: 200 }}
	>
		{#if isLoading}
			<div class="flex h-32 w-full items-center justify-center">
				<span class="text-gray-400">Loading invite details...</span>
			</div>
		{:else if loadError || !invite || !server}
			<div class="text-center">
				<div
					class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-500"
				>
					<svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
				</div>
				<h2 class="text-lg font-bold text-gray-100">Invite Invalid</h2>
				<p class="mt-2 text-sm text-balance text-gray-400">
					{loadError || 'This invite link is invalid or has expired.'}
				</p>
				<a
					href="/app/direct"
					class="mt-6 inline-block rounded bg-[#35373c] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#404249]"
				>
					Return to App
				</a>
			</div>
		{:else}
			<!-- Server Icon -->
			<div
				class="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-[#1e1e1e] text-2xl font-bold shadow-md"
			>
				{#if server.server_profile?.iconUrl}
					<img
						src={server.server_profile.iconUrl}
						alt={server.name}
						class="h-full w-full object-cover"
					/>
				{:else}
					<span class="text-3xl text-primary">{server.name[0]?.toUpperCase()}</span>
				{/if}
			</div>

			<!-- Title & Subtitle -->
			<div class="text-center">
				<h2 class="text-xs font-bold tracking-widest text-gray-400 uppercase">
					You've been invited to join
				</h2>
				<h1 class="mt-2 text-2xl font-bold text-gray-100">{server.name}</h1>
			</div>

			{#if !invite.is_valid}
				<div
					class="w-full rounded border border-red-500/20 bg-red-500/10 p-4 text-center text-sm font-medium text-red-500"
				>
					This invite link is invalid or has expired.
				</div>
				<a
					href="/app/direct"
					class="mt-2 text-sm text-gray-400 transition-colors hover:text-gray-200"
				>
					No thanks, return to DMs
				</a>
			{:else}
				{#if invite.has_password}
					<div class="flex w-full flex-col gap-2">
						<label class="text-xs font-bold text-gray-400 uppercase">
							Invite Password Required
							<input
								type="password"
								bind:value={password}
								placeholder="Enter password"
								class="mt-1 w-full rounded border border-transparent bg-[#1e1e1e] p-3 text-white transition-colors outline-none focus:border-blue-500"
							/>
						</label>
					</div>
				{/if}

				{#if joinError}
					<div class="w-full text-center text-sm font-medium text-red-500">
						{joinError}
					</div>
				{/if}

				<button
					class="w-full rounded bg-indigo-500 px-4 py-3 font-bold text-white transition-all hover:bg-indigo-600 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
					onclick={handleJoin}
					disabled={isJoining || (invite.has_password && !password)}
				>
					{isJoining ? 'Joining...' : 'Accept Invite'}
				</button>

				<a
					href="/app/direct"
					class="mt-2 text-sm text-gray-400 transition-colors hover:text-gray-200"
				>
					No thanks, return to DMs
				</a>
			{/if}
		{/if}
	</div>
</div>
