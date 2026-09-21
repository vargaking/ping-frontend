<script lang="ts">
	import { useInvite, getInvite } from '$lib/requests/invites';
	import { getServer } from '$lib/requests/servers/getServer';
	import { serversState } from '$lib/states/serversState.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { getErrorMessage } from '$lib/requests/errors';
	import { goto } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import { page } from '$app/stores';
	import type { InvitePublicResponse } from '$lib/types/invite.types';
	import type { Server } from '$lib/types/server.types';

	const loggedIn = $derived(!!usersState.loggedInUser);

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
		} catch (e: unknown) {
			console.error('Failed to load invite data:', e);
			loadError = getErrorMessage(e) || 'Invite not found or invalid.';
		} finally {
			isLoading = false;
		}
	}

	async function handleJoin() {
		if (!invite || !invite.is_valid) return;

		// Accepting requires an account. Send guests through login first, preserving
		// the invite as `next` so they land back here and complete the join.
		if (!loggedIn) {
			goto(`/login?next=${encodeURIComponent(`/invite/${inviteCode}`)}`);
			return;
		}

		isJoining = true;
		joinError = null;

		try {
			const result = await useInvite(invite.id, invite.has_password ? { password } : {});

			// If join is successful, immediately fetch user servers to update the state
			await serversState.fetchUserServers();

			// Navigate to the server page
			goto(`/app/server/${result.server_id}`);
		} catch (e: unknown) {
			console.error('Failed to join server via invite:', e);
			joinError = getErrorMessage(e) || 'Failed to join the server.';
		} finally {
			isJoining = false;
		}
	}
</script>

<div class="flex h-screen w-full items-center justify-center bg-background p-4 text-foreground">
	<div
		class="flex w-full max-w-sm flex-col items-center gap-6 rounded-lg bg-card p-8 shadow-xl"
		in:fade={{ duration: 200 }}
	>
		{#if isLoading}
			<div class="flex h-32 w-full items-center justify-center">
				<span class="text-muted-foreground">Loading invite details...</span>
			</div>
		{:else if loadError || !invite || !server}
			<div class="text-center">
				<div
					class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive"
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
				<h2 class="text-lg font-bold text-foreground">Invite Invalid</h2>
				<p class="mt-2 text-sm text-balance text-muted-foreground">
					{loadError || 'This invite link is invalid or has expired.'}
				</p>
				<a
					href="/app/direct"
					class="mt-6 inline-block rounded bg-accent px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
				>
					Return to App
				</a>
			</div>
		{:else}
			<!-- Server Icon -->
			<div
				class="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-surface-input text-2xl font-bold shadow-md"
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
				<h2 class="text-xs font-bold tracking-widest text-muted-foreground uppercase">
					You've been invited to join
				</h2>
				<h1 class="mt-2 text-2xl font-bold text-foreground">{server.name}</h1>
			</div>

			{#if !invite.is_valid}
				<div
					class="w-full rounded border border-destructive-border bg-destructive/10 p-4 text-center text-sm font-medium text-destructive"
				>
					This invite link is invalid or has expired.
				</div>
				<a
					href="/app/direct"
					class="mt-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					No thanks, return to DMs
				</a>
			{:else}
				{#if loggedIn && invite.has_password}
					<div class="flex w-full flex-col gap-2">
						<label class="text-xs font-bold text-muted-foreground uppercase">
							Invite Password Required
							<input
								type="password"
								bind:value={password}
								placeholder="Enter password"
								class="mt-1 w-full rounded border border-transparent bg-surface-input p-3 text-foreground transition-colors outline-none focus:border-ring"
							/>
						</label>
					</div>
				{/if}

				{#if joinError}
					<div class="w-full text-center text-sm font-medium text-destructive">
						{joinError}
					</div>
				{/if}

				<button
					class="w-full rounded bg-primary px-4 py-3 font-bold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
					onclick={handleJoin}
					disabled={isJoining || (loggedIn && invite.has_password && !password)}
				>
					{#if !loggedIn}
						Sign in to accept
					{:else if isJoining}
						Joining...
					{:else}
						Accept Invite
					{/if}
				</button>

				<a
					href="/app/direct"
					class="mt-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					No thanks, return to DMs
				</a>
			{/if}
		{/if}
	</div>
</div>
