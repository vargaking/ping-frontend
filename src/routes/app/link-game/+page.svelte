<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { claimGameLink, getGameLinkPreview } from '$lib/requests/game';
	import { linkCodeProblem } from '$lib/utils/gameLinkError';
	import type { GameLinkPreview } from '$lib/types/game.types';
	import Button from '$lib/components/ui/button/button.svelte';
	import LinkCodeForm from '$lib/components/game/LinkCodeForm.svelte';
	import { Gamepad2 } from 'lucide-svelte';

	type Phase = 'loading' | 'preview' | 'linked' | 'problem';

	const code = $derived(page.url.searchParams.get('code')?.trim().toUpperCase() ?? '');

	let phase = $state<Phase>('loading');
	let preview = $state<GameLinkPreview | null>(null);
	let problem = $state('');
	let claiming = $state(false);

	$effect(() => {
		if (code) void loadPreview(code);
	});

	async function loadPreview(forCode: string) {
		phase = 'loading';
		preview = null;
		try {
			const fetched = await getGameLinkPreview(forCode);
			if (forCode !== code) return;
			preview = fetched;
			phase = 'preview';
		} catch (e) {
			if (forCode !== code) return;
			problem = linkCodeProblem(e);
			phase = 'problem';
		}
	}

	async function link() {
		if (!preview || claiming) return;
		claiming = true;
		try {
			await claimGameLink(code);
			phase = 'linked';
		} catch (e) {
			problem = linkCodeProblem(e);
			phase = 'problem';
		} finally {
			claiming = false;
		}
	}
</script>

<svelte:head><title>Link game account</title></svelte:head>

<div class="flex h-full items-center justify-center overflow-y-auto p-6 max-md:p-4">
	<div class="flex w-full max-w-sm flex-col gap-5 rounded-xl border border-border bg-card p-6">
		<div class="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-text-subtle">
			<Gamepad2 size={20} strokeWidth={1.75} />
		</div>

		{#if !code}
			<h1 class="text-[15px] font-semibold">Link a game account</h1>
			<LinkCodeForm />
		{:else if phase === 'loading'}
			<p class="text-sm text-muted-foreground" role="status">Checking the code…</p>
		{:else if phase === 'linked'}
			<p class="text-sm" role="status">
				Linked. While you play, you'll hear nearby players in the voice channel.
			</p>
			{#if preview}
				<Button href="/app/server/{preview.server_id}/" class="w-fit">
					Open {preview.server_name}
				</Button>
			{/if}
		{:else if phase === 'problem'}
			<p class="text-sm text-destructive" role="alert">{problem}</p>
			<Button variant="secondary" class="w-fit" href="/app/link-game/">Use another code</Button>
		{:else if preview}
			<div class="flex flex-col gap-1">
				<h1 class="text-[15px] leading-snug font-semibold">
					Link {preview.player_name} on {preview.server_name} to your Zet account?
				</h1>
				<p class="text-[13px] text-text-subtle">{preview.integration_name}</p>
			</div>
			{#if preview.linked_player_name}
				<p class="text-[13px] text-muted-foreground">
					This replaces your link to {preview.linked_player_name}.
				</p>
			{/if}
			<div class="flex gap-2">
				<Button disabled={claiming} onclick={link}>{claiming ? 'Linking…' : 'Link'}</Button>
				<Button variant="ghost" disabled={claiming} onclick={() => goto('/app/')}>Cancel</Button>
			</div>
		{/if}
	</div>
</div>
