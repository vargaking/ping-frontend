<script module lang="ts">
	export type ChartSeries = {
		label: string;
		values: (number | null)[];
		color: string;
	};
</script>

<script lang="ts">
	type Props = {
		title: string;
		times: number[];
		series: ChartSeries[];
		unit?: string;
		reference?: { value: number; label: string };
		formatTime: (time: number) => string;
		formatValue?: (value: number) => string;
	};

	let {
		title,
		times,
		series,
		unit = '',
		reference,
		formatTime,
		formatValue = (value) => value.toLocaleString('en', { maximumFractionDigits: 1 })
	}: Props = $props();

	const HEIGHT = 180;
	const PAD = { top: 8, right: 8, bottom: 22, left: 44 };
	const X_LABELS = 4;

	let width = $state(0);
	let hovered = $state<number | null>(null);

	const plotWidth = $derived(Math.max(width - PAD.left - PAD.right, 1));
	const plotHeight = HEIGHT - PAD.top - PAD.bottom;

	function niceMax(value: number): number {
		if (value <= 0) return 1;
		const magnitude = 10 ** Math.floor(Math.log10(value));
		const step = [1, 2, 5, 10].find((s) => s * magnitude >= value) ?? 10;
		return step * magnitude;
	}

	const top = $derived(
		niceMax(
			Math.max(
				reference?.value ?? 0,
				...series.flatMap((s) => s.values.filter((v): v is number => v !== null))
			)
		)
	);

	const x = (i: number) => PAD.left + (times.length < 2 ? 0 : (i / (times.length - 1)) * plotWidth);
	const y = (value: number) => PAD.top + plotHeight - (value / top) * plotHeight;

	function segments(values: (number | null)[]): { i: number; value: number }[][] {
		const result: { i: number; value: number }[][] = [];
		let current: { i: number; value: number }[] = [];
		values.forEach((value, i) => {
			if (value === null) {
				if (current.length) result.push(current);
				current = [];
			} else {
				current.push({ i, value });
			}
		});
		if (current.length) result.push(current);
		return result;
	}

	const path = (points: { i: number; value: number }[]) =>
		points.map((p, n) => `${n === 0 ? 'M' : 'L'}${x(p.i)},${y(p.value)}`).join(' ');

	const yTicks = $derived([0, top / 2, top]);
	const xTicks = $derived(
		times.length === 0
			? []
			: Array.from({ length: X_LABELS }, (_, n) =>
					Math.round((n / (X_LABELS - 1)) * (times.length - 1))
				)
	);

	function hover(event: PointerEvent) {
		if (times.length === 0) return;
		const box = (event.currentTarget as SVGElement).getBoundingClientRect();
		const ratio = (event.clientX - box.left - PAD.left) / plotWidth;
		hovered = Math.min(Math.max(Math.round(ratio * (times.length - 1)), 0), times.length - 1);
	}

	const withUnit = (value: number) => `${formatValue(value)}${unit}`;
</script>

<figure class="flex flex-col gap-2">
	<figcaption class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
		<span class="text-sm font-medium">{title}</span>
		<span class="flex flex-wrap gap-x-3 text-xs text-text-subtle">
			{#each series as s (s.label)}
				<span class="flex items-center gap-1.5">
					<span class="h-0.5 w-3 rounded-full" style="background: {s.color}"></span>
					{s.label}
				</span>
			{/each}
			{#if reference}
				<span class="flex items-center gap-1.5">
					<span class="w-3 border-t border-dashed border-text-subtle"></span>
					{reference.label}
				</span>
			{/if}
		</span>
	</figcaption>

	<div class="relative" bind:clientWidth={width}>
		<svg
			{width}
			height={HEIGHT}
			role="img"
			aria-label={title}
			class="touch-pan-y overflow-visible"
			onpointermove={hover}
			onpointerleave={() => (hovered = null)}
		>
			{#each yTicks as tick (tick)}
				<line
					x1={PAD.left}
					x2={width - PAD.right}
					y1={y(tick)}
					y2={y(tick)}
					class="stroke-border"
				/>
				<text
					x={PAD.left - 6}
					y={y(tick)}
					text-anchor="end"
					dominant-baseline="middle"
					class="fill-text-subtle text-[10px] tabular-nums"
				>
					{formatValue(tick)}
				</text>
			{/each}

			{#each xTicks as i, n (n)}
				<text
					x={x(i)}
					y={HEIGHT - 6}
					text-anchor={n === 0 ? 'start' : n === xTicks.length - 1 ? 'end' : 'middle'}
					class="fill-text-subtle text-[10px]"
				>
					{formatTime(times[i])}
				</text>
			{/each}

			{#if reference}
				<line
					x1={PAD.left}
					x2={width - PAD.right}
					y1={y(reference.value)}
					y2={y(reference.value)}
					stroke-dasharray="4 4"
					class="stroke-text-subtle"
				/>
			{/if}

			{#each series as s (s.label)}
				{#each segments(s.values) as points, n (n)}
					{#if points.length === 1}
						<circle cx={x(points[0].i)} cy={y(points[0].value)} r="2" fill={s.color} />
					{:else}
						<path
							d={path(points)}
							fill="none"
							stroke={s.color}
							stroke-width="1.5"
							stroke-linejoin="round"
						/>
					{/if}
				{/each}
			{/each}

			{#if hovered !== null}
				<line
					x1={x(hovered)}
					x2={x(hovered)}
					y1={PAD.top}
					y2={PAD.top + plotHeight}
					class="stroke-border-strong"
				/>
				{#each series as s (s.label)}
					{@const value = s.values[hovered]}
					{#if value !== null}
						<circle cx={x(hovered)} cy={y(value)} r="3" fill={s.color} />
					{/if}
				{/each}
			{/if}
		</svg>

		{#if hovered !== null}
			<div
				class="pointer-events-none absolute top-0 z-10 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
				style="left: {Math.min(Math.max(x(hovered) - 60, 0), Math.max(width - 130, 0))}px"
			>
				<div class="text-text-subtle">{formatTime(times[hovered])}</div>
				{#each series as s (s.label)}
					{@const value = s.values[hovered]}
					<div class="flex items-center gap-1.5 tabular-nums">
						<span class="h-2 w-2 rounded-full" style="background: {s.color}"></span>
						{s.label}: {value === null ? '—' : withUnit(value)}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</figure>
