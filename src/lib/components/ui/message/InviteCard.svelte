<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import ServerIcon from '$lib/components/ui/avatar/ServerIcon.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { getErrorMessage } from '$lib/requests/errors';
	import { inviteCardsState } from '$lib/states/inviteCardsState.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { joinInvite } from '$lib/utils/joinInvite';

	let { code }: { code: string } = $props();

	const userId = $derived(usersState.loggedInUser?.id ?? null);
	const entry = $derived(inviteCardsState.entry(code, userId));
	const invite = $derived(entry?.status === 'ready' ? entry.invite : null);
	const isMember = $derived(
		invite !== null && serversState.servers[invite.server_id] !== undefined
	);
	const loading = $derived(entry === undefined || (invite !== null && !serversState.loaded));
	const domain = window.location.hostname;

	let joining = $state(false);
	let joinError = $state<string | null>(null);

	$effect(() => {
		const owner = userId;
		const inviteCode = code;
		untrack(() => void inviteCardsState.load(inviteCode, owner));
	});

	async function onAction() {
		if (!invite) return;
		if (isMember) {
			goto(`/app/server/${invite.server_id}`);
			return;
		}
		// The invite page asks for the password and sends guests to log in first.
		if (invite.has_password || userId === null) {
			goto(`/invite/${code}`);
			return;
		}

		joining = true;
		joinError = null;
		try {
			const serverId = await joinInvite(invite.id);
			void inviteCardsState.refresh(code, userId);
			goto(`/app/server/${serverId}`);
		} catch (e) {
			console.error('Failed to join server via invite card:', e);
			joinError = getErrorMessage(e);
		} finally {
			joining = false;
		}
	}
</script>

{#if entry?.status !== 'failed'}
	<div
		role="group"
		aria-label="Server invite"
		aria-busy={loading}
		class="max-w-[432px] min-w-0 rounded-lg border border-l-4 border-border border-l-primary bg-card p-3"
	>
		<div class="flex min-h-12 items-center gap-3">
			{#if loading}
				<span class="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-accent" aria-hidden="true"
				></span>
				<div class="min-w-0 flex-1 space-y-1" aria-hidden="true">
					<div class="h-4 w-24 animate-pulse rounded bg-accent"></div>
					<div class="h-5 w-40 max-w-full animate-pulse rounded bg-accent"></div>
				</div>
			{:else if invite}
				<ServerIcon
					name={invite.server_name}
					serverId={invite.server_id}
					iconUrl={invite.server_icon}
					iconText={invite.server_icon_text}
					iconTone={invite.server_icon_tone}
					class="h-12 w-12 rounded-xl text-lg"
				/>
				<div class="min-w-0 flex-1">
					<div class="truncate text-xs leading-4 text-text-subtle">{domain}</div>
					<div class="truncate text-sm leading-5 font-semibold text-foreground">
						{invite.server_name}
					</div>
					<div class="truncate text-[13px] leading-4 text-text-body">
						{#if invite.is_valid}
							{invite.member_count}
							{invite.member_count === 1 ? 'member' : 'members'}
						{:else}
							This invite has expired
						{/if}
					</div>
				</div>
				{#if invite.is_valid}
					<Button size="sm" disabled={joining} aria-busy={joining} onclick={onAction}>
						{#if joining}Joining...{:else if isMember}Open{:else}Join{/if}
					</Button>
				{/if}
			{:else}
				<div class="text-sm text-muted-foreground">This invite is no longer valid</div>
			{/if}
		</div>
		{#if joinError}
			<p role="alert" class="mt-2 text-xs text-destructive">{joinError}</p>
		{/if}
	</div>
{/if}
