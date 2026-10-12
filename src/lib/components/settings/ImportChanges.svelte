<script lang="ts">
	import type { ServerMember } from '$lib/types/server.types';
	import type { ImportAuthorChange } from '$lib/types/serverImport.types';
	import { timeAgo } from '$lib/utils/timeAgo';

	type Props = {
		changes: ImportAuthorChange[];
		/** null while the members are loading. */
		members: ServerMember[] | null;
	};

	let { changes, members }: Props = $props();

	const names = $derived(new Map((members ?? []).map((m) => [m.user.id, m.user.username])));

	const who = (id: number | null) =>
		id === null ? 'Not mapped' : (names.get(id) ?? 'Former member');
</script>

{#if members}
	<section aria-labelledby="import-changes-heading" class="flex flex-col gap-2">
		<h3 id="import-changes-heading" class="text-sm font-semibold">Recent changes</h3>
		{#if changes.length === 0}
			<p class="text-[13px] text-muted-foreground">No changes yet.</p>
		{:else}
			<ul aria-label="Recent changes" class="flex flex-col gap-1 text-[13px] text-muted-foreground">
				{#each changes as change (change.id)}
					<li>
						{change.actor_id === null ? 'Someone' : (names.get(change.actor_id) ?? 'Former member')}
						· {change.author_name} · {who(change.from_user_id)} → {who(change.to_user_id)} · {timeAgo(
							change.created_at
						)}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}
