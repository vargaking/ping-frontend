<script lang="ts">
	import { onMount } from 'svelte';
	import { getAdminStats } from '$lib/requests/admin/getAdminStats';
	import { formatBytes } from '$lib/requests/attachments/uploadAttachment';
	import { timeAgo } from '$lib/utils/timeAgo';
	import type { AdminServer, AdminStats } from '$lib/types/admin.types';
	import * as Card from '$lib/components/ui/card/index';
	import ErrorState from '$lib/components/ui/feedback/ErrorState.svelte';

	const POLL_MS = 10_000;
	const STALE_AFTER_MS = 30_000;
	const WARN_RATIO = 0.7;
	const CRITICAL_RATIO = 0.9;
	const DAY_MS = 86_400_000;

	let stats = $state<AdminStats | null>(null);
	let loadedAt = $state<number | null>(null);
	let failed = $state(false);
	let now = $state(Date.now());
	let inFlight = false;

	const stale = $derived(loadedAt !== null && now - loadedAt > STALE_AFTER_MS);
	const updatedSecondsAgo = $derived(
		loadedAt === null ? 0 : Math.max(0, Math.round((now - loadedAt) / 1000))
	);

	async function poll() {
		if (inFlight || document.hidden) return;
		inFlight = true;
		try {
			stats = await getAdminStats();
			loadedAt = Date.now();
			failed = false;
		} catch (e) {
			console.warn('Failed to load admin stats', e);
			failed = true;
		} finally {
			inFlight = false;
		}
	}

	onMount(() => {
		void poll();
		const poller = setInterval(poll, POLL_MS);
		const ticker = setInterval(() => (now = Date.now()), 1000);
		const onVisibility = () => {
			now = Date.now();
			void poll();
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			clearInterval(poller);
			clearInterval(ticker);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});

	type ServerSort = 'messages_24h' | 'members' | 'name';
	let serverSort = $state<ServerSort>('messages_24h');

	const SERVER_ORDER: Record<ServerSort, (a: AdminServer, b: AdminServer) => number> = {
		messages_24h: (a, b) => b.messages_24h - a.messages_24h || a.name.localeCompare(b.name),
		members: (a, b) => b.members - a.members || a.name.localeCompare(b.name),
		name: (a, b) => a.name.localeCompare(b.name)
	};

	const sortedServers = $derived(
		stats?.servers?.list ? [...stats.servers.list].sort(SERVER_ORDER[serverSort]) : []
	);

	const DASH = '—';

	function num(value: number | null | undefined, digits = 0): string {
		return value === null || value === undefined || !Number.isFinite(value)
			? DASH
			: value.toLocaleString('en', { maximumFractionDigits: digits });
	}

	function bytes(value: number | null | undefined): string {
		return value === null || value === undefined || !Number.isFinite(value)
			? DASH
			: formatBytes(value);
	}

	function ratio(value: number | null | undefined, total: number | null | undefined): number {
		if (value === null || value === undefined || !total || !Number.isFinite(value)) return 0;
		return Math.min(Math.max(value / total, 0), 1);
	}

	function meterColor(r: number): string {
		if (r > CRITICAL_RATIO) return 'bg-destructive';
		if (r > WARN_RATIO) return 'bg-idle';
		return 'bg-primary';
	}

	const sinceRestart = (since: string) => Date.now() - new Date(since).getTime() < DAY_MS;
</script>

{#snippet stat(label: string, value: string)}
	<div class="flex flex-col gap-1">
		<dt class="text-xs text-text-subtle">{label}</dt>
		<dd class="text-xl font-semibold tabular-nums">{value}</dd>
	</div>
{/snippet}

{#snippet meter(label: string, value: string, r: number)}
	<div class="flex flex-col gap-2">
		<div class="flex items-baseline justify-between gap-2 text-sm">
			<span class="text-text-subtle">{label}</span>
			<span class="font-medium tabular-nums">{value}</span>
		</div>
		<div
			role="progressbar"
			aria-label={label}
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow={Math.round(r * 100)}
			class="h-2 overflow-hidden rounded-full bg-border"
		>
			<div class="h-full rounded-full {meterColor(r)}" style="width: {r * 100}%"></div>
		</div>
	</div>
{/snippet}

{#snippet unavailable(text: string)}
	<p class="text-sm text-text-subtle">{text}</p>
{/snippet}

{#snippet sortButton(key: ServerSort, label: string)}
	<button
		type="button"
		onclick={() => (serverSort = key)}
		class="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {serverSort ===
		key
			? 'text-foreground'
			: ''}"
	>
		{label}
	</button>
{/snippet}

<div class="mx-auto flex max-w-5xl flex-col gap-4">
	<div class="flex items-center justify-between gap-4">
		<h2 class="text-lg font-semibold">Overview</h2>
		{#if loadedAt !== null}
			<p
				class="text-xs {stale || failed ? 'text-destructive' : 'text-text-subtle'}"
				role={stale ? 'status' : undefined}
			>
				Last updated {updatedSecondsAgo}s ago{stale ? ' · refresh failing' : ''}
			</p>
		{/if}
	</div>

	{#if stats === null}
		{#if failed}
			<ErrorState onRetry={poll} />
		{:else}
			<p class="text-sm text-text-subtle">Loading…</p>
		{/if}
	{:else}
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<Card.Root class="gap-4 md:col-span-2">
				<Card.Header><Card.Title>Load</Card.Title></Card.Header>
				<Card.Content class="flex flex-col gap-5">
					{#if stats.load}
						{@const load = stats.load}
						{@render meter(
							'Out',
							`${num(load.net_out_mbps, 1)} / ${num(load.uplink_mbps)} Mbps`,
							ratio(load.net_out_mbps, load.uplink_mbps)
						)}
						{@render meter(
							'In',
							`${num(load.net_in_mbps, 1)} / ${num(load.uplink_mbps)} Mbps`,
							ratio(load.net_in_mbps, load.uplink_mbps)
						)}
						<dl class="grid grid-cols-1 gap-4 sm:grid-cols-3">
							{@render stat('CPU', `${num(load.cpu_percent, 1)}%`)}
							{@render stat(
								'RAM',
								`${bytes(load.ram_used_bytes)} / ${bytes(load.ram_total_bytes)}`
							)}
							{@render stat(
								'Disk free',
								`${bytes(load.disk_free_bytes)} / ${bytes(load.disk_total_bytes)}`
							)}
						</dl>
					{:else}
						{@render unavailable('Host metrics unavailable')}
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root class="gap-4">
				<Card.Header><Card.Title>Voice</Card.Title></Card.Header>
				<Card.Content class="flex flex-col gap-4">
					{#if stats.voice}
						<dl class="grid grid-cols-2 gap-4">
							{@render stat('Rooms', num(stats.voice.rooms))}
							{@render stat('Participants', num(stats.voice.participants))}
						</dl>
						<div class="flex flex-col gap-1">
							<p class="text-xs text-text-subtle">
								Screenshares ({num(stats.voice.screenshares.length)})
							</p>
							{#if stats.voice.screenshares.length === 0}
								<p class="text-sm">{DASH}</p>
							{:else}
								<ul class="text-sm tabular-nums">
									{#each stats.voice.screenshares as share, i (i)}
										<li>{share.width}×{share.height}</li>
									{/each}
								</ul>
							{/if}
						</div>
					{:else if !stats.voice_status || stats.voice_status === 'unconfigured'}
						{@render unavailable('Voice not configured')}
					{:else}
						<div class="flex flex-col gap-1">
							{@render unavailable("Can't reach LiveKit")}
							<p class="text-xs text-text-subtle">
								Check <code>LIVEKIT_API_URL</code> on the server.
							</p>
						</div>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root class="gap-4">
				<Card.Header><Card.Title>Users</Card.Title></Card.Header>
				<Card.Content>
					{#if stats.users}
						<dl class="grid grid-cols-2 gap-4 sm:grid-cols-3">
							{@render stat('Total', num(stats.users.total))}
							{@render stat('New, 7 days', num(stats.users.new_7d))}
							{@render stat('Active now', num(stats.users.active_now))}
							{@render stat('Online', num(stats.users.online))}
							{@render stat('DAU', num(stats.users.dau))}
							{@render stat('WAU', num(stats.users.wau))}
						</dl>
					{:else}
						{@render unavailable('User numbers unavailable')}
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root class="gap-4">
				<Card.Header><Card.Title>Errors</Card.Title></Card.Header>
				<Card.Content class="flex flex-col gap-3">
					{#if stats.errors}
						<dl class="grid grid-cols-2 gap-4">
							{@render stat('Client, 24h', num(stats.errors.client_24h))}
							{@render stat('Server 5xx, 24h', num(stats.errors.server_5xx_24h))}
						</dl>
						{#if sinceRestart(stats.errors.since)}
							<p class="text-xs text-text-subtle">
								Counted since restart {timeAgo(stats.errors.since)}
							</p>
						{/if}
					{:else}
						{@render unavailable('Error counts unavailable')}
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root class="gap-4 md:col-span-2">
				<Card.Header><Card.Title>Servers</Card.Title></Card.Header>
				<Card.Content class="flex flex-col gap-4">
					{#if stats.servers}
						<dl class="grid grid-cols-2 gap-4">
							{@render stat('Total', num(stats.servers.total))}
							<div class="flex flex-col gap-1">
								<dt class="text-xs text-text-subtle">Pending requests</dt>
								<dd class="text-xl font-semibold tabular-nums">
									<a
										href="/admin/waitlist/"
										class="underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
									>
										{num(stats.servers.pending_requests)}
									</a>
								</dd>
							</div>
						</dl>
						{#if sortedServers.length === 0}
							{@render unavailable('No servers yet')}
						{:else}
							<div class="overflow-x-auto rounded-xl border border-border">
								<table class="w-full text-left text-sm">
									<thead class="border-b border-border text-xs text-text-subtle">
										<tr>
											<th
												scope="col"
												class="px-4 py-2.5 font-medium"
												aria-sort={serverSort === 'name' ? 'ascending' : 'none'}
											>
												{@render sortButton('name', 'Server')}
											</th>
											<th
												scope="col"
												class="px-4 py-2.5 text-right font-medium"
												aria-sort={serverSort === 'members' ? 'descending' : 'none'}
											>
												{@render sortButton('members', 'Members')}
											</th>
											<th
												scope="col"
												class="px-4 py-2.5 text-right font-medium"
												aria-sort={serverSort === 'messages_24h' ? 'descending' : 'none'}
											>
												{@render sortButton('messages_24h', 'Msgs / 24h')}
											</th>
											<th scope="col" class="px-4 py-2.5 text-right font-medium">Msgs total</th>
											<th scope="col" class="px-4 py-2.5 text-right font-medium">In voice</th>
											<th scope="col" class="px-4 py-2.5 text-right font-medium">Created</th>
										</tr>
									</thead>
									<tbody>
										{#each sortedServers as server (server.id)}
											<tr class="border-b border-border last:border-b-0">
												<td class="max-w-0 truncate px-4 py-2.5 font-medium">{server.name}</td>
												<td class="px-4 py-2.5 text-right tabular-nums">{num(server.members)}</td>
												<td class="px-4 py-2.5 text-right tabular-nums">
													{num(server.messages_24h)}
												</td>
												<td class="px-4 py-2.5 text-right tabular-nums">
													{num(server.messages_total)}
												</td>
												<td class="px-4 py-2.5 text-right tabular-nums">{num(server.in_voice)}</td>
												<td class="px-4 py-2.5 text-right whitespace-nowrap text-text-subtle">
													{new Date(server.created_at).toLocaleDateString()}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					{:else}
						{@render unavailable('Server numbers unavailable')}
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	{/if}
</div>
