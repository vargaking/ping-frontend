<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { listGameLinks, unlinkGameUser } from '$lib/requests/game';
	import { getErrorMessage } from '$lib/requests/errors';
	import type { GameLink } from '$lib/types/game.types';
	import Button from '$lib/components/ui/button/button.svelte';
	import LoadingList from '$lib/components/ui/feedback/LoadingList.svelte';
	import ErrorState from '$lib/components/ui/feedback/ErrorState.svelte';
	import { X } from 'lucide-svelte';

	type Props = {
		integrationId: number;
		/** Called with how many players are linked, after every load and unlink. */
		oncount: (count: number) => void;
	};

	let { integrationId, oncount }: Props = $props();

	let links = $state<GameLink[]>([]);
	let isLoading = $state(true);
	let loadError = $state(false);
	let removing = $state<number | null>(null);

	$effect(() => {
		void load(integrationId);
	});

	async function load(id: number) {
		isLoading = true;
		loadError = false;
		try {
			const fetched = await listGameLinks(id);
			if (id !== integrationId) return;
			links = fetched;
			oncount(links.length);
		} catch (e) {
			console.error('Failed to fetch game links', e);
			loadError = true;
		} finally {
			isLoading = false;
		}
	}

	async function unlink(link: GameLink) {
		if (removing != null) return;
		removing = link.user_id;
		try {
			await unlinkGameUser(integrationId, link.user_id);
			links = links.filter((l) => l.user_id !== link.user_id);
			oncount(links.length);
		} catch (e) {
			toast.error(`Couldn't unlink ${link.username}: ${getErrorMessage(e)}`);
		} finally {
			removing = null;
		}
	}
</script>

{#if isLoading}
	<LoadingList rows={2} />
{:else if loadError}
	<ErrorState
		title="Couldn’t load linked players"
		description="There was a problem reaching the server."
		onRetry={() => load(integrationId)}
	/>
{:else if links.length === 0}
	<p class="text-[13px] text-text-subtle">
		Nobody has linked a game account yet. Players run /zeta link in the game.
	</p>
{:else}
	<ul class="flex flex-col" aria-label="Linked players">
		{#each links as link (link.user_id)}
			<li class="flex min-h-10 items-center gap-3 rounded-lg px-2 hover:bg-card">
				<span class="min-w-0 flex-1 truncate text-sm">
					{link.username}
					<span class="text-text-subtle">as {link.player_name}</span>
				</span>
				<Button
					variant="ghost"
					size="icon-sm"
					class="rounded-lg text-muted-foreground hover:text-destructive"
					aria-label="Unlink {link.username}"
					disabled={removing === link.user_id}
					onclick={() => unlink(link)}
				>
					<X size={16} strokeWidth={1.75} />
				</Button>
			</li>
		{/each}
	</ul>
{/if}
