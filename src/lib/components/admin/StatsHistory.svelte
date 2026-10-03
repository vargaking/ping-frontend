<script lang="ts">
	import { onMount } from 'svelte';
	import { getAdminStatsHistory } from '$lib/requests/admin/getAdminStatsHistory';
	import type {
		AdminHistoryMetric,
		AdminHistoryPeak,
		AdminHistoryRange,
		AdminStatsHistory
	} from '$lib/types/admin.types';
	import * as Card from '$lib/components/ui/card/index';
	import ErrorState from '$lib/components/ui/feedback/ErrorState.svelte';
	import LineChart, { type ChartSeries } from './LineChart.svelte';

	const REFRESH_MS = 60_000;
	const RANGE_KEY = 'admin-history-range';
	const DASH = '—';

	const ranges: AdminHistoryRange[] = ['1h', '24h', '7d', '30d'];

	function savedRange(): AdminHistoryRange {
		try {
			const raw = localStorage.getItem(RANGE_KEY);
			return ranges.find((r) => r === raw) ?? '24h';
		} catch {
			return '24h';
		}
	}

	let range = $state<AdminHistoryRange>('24h');
	let history = $state<AdminStatsHistory | null>(null);
	let failed = $state(false);
	let requestId = 0;

	async function load() {
		if (document.hidden) return;
		const id = ++requestId;
		const requested = range;
		try {
			const result = await getAdminStatsHistory(requested);
			if (id !== requestId) return;
			history = result;
			failed = false;
		} catch (e) {
			if (id !== requestId) return;
			console.warn('Failed to load admin stats history', e);
			failed = true;
		}
	}

	function select(next: AdminHistoryRange) {
		if (next === range) return;
		range = next;
		history = null;
		try {
			localStorage.setItem(RANGE_KEY, next);
		} catch {
			// Storage unavailable: the choice just isn't remembered.
		}
		void load();
	}

	onMount(() => {
		range = savedRange();
		void load();
		const refresh = setInterval(load, REFRESH_MS);
		const onVisibility = () => void load();
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			clearInterval(refresh);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});

	const longRange = $derived(range === '7d' || range === '30d');
	const times = $derived(history?.buckets.map((b) => new Date(b).getTime()) ?? []);
	const empty = $derived(
		history !== null && Object.values(history.series).every((s) => s.max.every((v) => v === null))
	);

	function formatTime(time: number): string {
		const date = new Date(time);
		return longRange
			? date.toLocaleString([], {
					month: 'short',
					day: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				})
			: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function peakTime(peak: AdminHistoryPeak | null): string {
		return peak === null ? '' : formatTime(new Date(peak.at).getTime());
	}

	function num(value: number, digits = 0): string {
		return value.toLocaleString('en', { maximumFractionDigits: digits });
	}

	function line(
		metric: AdminHistoryMetric,
		label: string,
		color: string,
		kind: 'avg' | 'max'
	): ChartSeries {
		return { label, color, values: history?.series[metric][kind] ?? [] };
	}

	const charts = $derived([
		{
			title: 'Network',
			unit: ' Mbps',
			reference: history ? { value: history.uplink_mbps, label: 'Uplink' } : undefined,
			series: [
				line('net_out_mbps', 'Out', 'var(--chart-1)', 'max'),
				line('net_in_mbps', 'In', 'var(--chart-2)', 'max')
			]
		},
		{
			title: 'CPU and RAM',
			unit: '%',
			reference: undefined,
			series: [
				line('cpu_percent', 'CPU', 'var(--chart-1)', 'avg'),
				line('ram_percent', 'RAM', 'var(--chart-3)', 'avg')
			]
		},
		{
			title: 'Users',
			unit: '',
			reference: undefined,
			series: [
				line('online_users', 'Online', 'var(--chart-1)', 'max'),
				line('active_users', 'Active', 'var(--chart-2)', 'max')
			]
		},
		{
			title: 'Voice',
			unit: '',
			reference: undefined,
			series: [
				line('voice_participants', 'Participants', 'var(--chart-1)', 'max'),
				line('screenshares', 'Screen shares', 'var(--chart-3)', 'max')
			]
		}
	]);
</script>

{#snippet peakCard(label: string, peak: AdminHistoryPeak | null, detail?: string)}
	<div class="flex flex-col gap-1 rounded-xl border border-border p-4">
		<dt class="text-xs text-text-subtle">{label}</dt>
		<dd class="text-xl font-semibold tabular-nums">
			{peak === null ? DASH : num(peak.value, 1)}
		</dd>
		<dd class="text-xs text-text-subtle">
			{#if peak === null}
				No data
			{:else}
				{detail ? `${detail} · ` : ''}{peakTime(peak)}
			{/if}
		</dd>
	</div>
{/snippet}

<section class="flex flex-col gap-4" aria-labelledby="history-heading">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<h2 id="history-heading" class="text-lg font-semibold">History</h2>
		<div role="group" aria-label="Time range" class="flex gap-1 rounded-lg bg-surface-input p-1">
			{#each ranges as r (r)}
				<button
					type="button"
					aria-pressed={range === r}
					onclick={() => select(r)}
					class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {range ===
					r
						? 'bg-accent text-foreground shadow-xs'
						: 'text-text-subtle hover:text-foreground'}"
				>
					{r}
				</button>
			{/each}
		</div>
	</div>

	{#if history === null}
		{#if failed}
			<ErrorState onRetry={load} />
		{:else}
			<p class="text-sm text-text-subtle">Loading…</p>
		{/if}
	{:else}
		{@const peaks = history.peaks}
		{@const out = peaks.net_out_mbps}
		<dl class="grid grid-cols-2 gap-4 lg:grid-cols-4">
			{@render peakCard(
				'Peak network out (Mbps)',
				out,
				out ? `${num((out.value / history.uplink_mbps) * 100, 1)}% of uplink` : undefined
			)}
			{@render peakCard('Peak voice participants', peaks.voice_participants)}
			{@render peakCard('Peak online users', peaks.online_users)}
			{@render peakCard('Peak screen shares', peaks.screenshares)}
		</dl>

		{#if empty}
			<Card.Root class="gap-1">
				<Card.Content class="flex flex-col gap-1">
					<p class="text-sm">No history yet.</p>
					{#if !history.sampling}
						<p class="text-xs text-text-subtle">Sampling is off on this server (STATS_SAMPLING).</p>
					{/if}
				</Card.Content>
			</Card.Root>
		{:else}
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				{#each charts as chart (chart.title)}
					<Card.Root class="gap-4">
						<Card.Content>
							<LineChart
								title={chart.title}
								{times}
								series={chart.series}
								unit={chart.unit}
								reference={chart.reference}
								{formatTime}
							/>
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
		{/if}
	{/if}
</section>
