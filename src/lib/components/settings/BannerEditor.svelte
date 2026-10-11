<script lang="ts">
	import { Check } from 'lucide-svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import ProfileBanner from '$lib/components/profile/ProfileBanner.svelte';
	import {
		BANNER_PRESETS,
		IMAGE_TYPES,
		imageProblem,
		type Banner,
		type BannerDraft
	} from '$lib/utils/profileCard';

	type Props = {
		saved: Banner;
		draft: BannerDraft | null;
		onchange: (draft: BannerDraft) => void;
		error?: string;
		onerror: (message?: string) => void;
	};

	let { saved, draft, onchange, error, onerror }: Props = $props();

	let fileInput: HTMLInputElement | undefined = $state();
	let previewUrl = $state<string | null>(null);

	$effect(() => {
		const file = draft?.kind === 'image' ? draft.file : null;
		if (!file) {
			previewUrl = null;
			return;
		}
		const url = URL.createObjectURL(file);
		previewUrl = url;
		return () => URL.revokeObjectURL(url);
	});

	const effective = $derived<Banner>(
		!draft
			? saved
			: draft.kind === 'image'
				? previewUrl
					? { kind: 'image', src: previewUrl }
					: saved
				: draft
	);
	const color = $derived(effective.kind === 'color' ? effective.color : null);
	const customSelected = $derived(
		color !== null && !(BANNER_PRESETS as readonly string[]).includes(color)
	);

	function choose(next: BannerDraft) {
		onerror(undefined);
		onchange(next);
	}

	function handleFileSelect(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;

		const problem = imageProblem(file);
		if (problem) {
			onerror(problem);
			return;
		}
		choose({ kind: 'image', file });
	}

	const swatch =
		'relative flex h-8 w-8 items-center justify-center rounded-full border border-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:h-11 pointer-coarse:w-11';
</script>

<div class="flex flex-col gap-2">
	<span class="text-[13px] font-medium text-text-label">Profile banner</span>
	<ProfileBanner banner={effective} class="h-20 rounded-lg" />

	<div role="radiogroup" aria-label="Banner colour" class="flex flex-wrap items-center gap-2">
		<button
			type="button"
			role="radio"
			aria-checked={effective.kind === 'default'}
			aria-label="Default"
			title="Default"
			class="{swatch} bg-accent"
			onclick={() => choose({ kind: 'default' })}
		>
			{#if effective.kind === 'default'}<Check size={14} strokeWidth={2.5} />{/if}
		</button>
		{#each BANNER_PRESETS as preset (preset)}
			<button
				type="button"
				role="radio"
				aria-checked={color === preset}
				aria-label={preset}
				title={preset}
				class={swatch}
				style:background-color={preset}
				onclick={() => choose({ kind: 'color', color: preset })}
			>
				{#if color === preset}<Check size={14} strokeWidth={2.5} class="text-white" />{/if}
			</button>
		{/each}
		<label
			class="{swatch} cursor-pointer overflow-hidden has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring {customSelected
				? 'ring-2 ring-ring'
				: 'bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)]'}"
			style:background-color={customSelected ? color : undefined}
			title="Custom colour"
		>
			<input
				type="color"
				aria-label="Custom colour"
				value={color ?? '#0090ff'}
				class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
				oninput={(e) => choose({ kind: 'color', color: e.currentTarget.value.toLowerCase() })}
			/>
		</label>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<Button
			variant="secondary"
			class="border border-input"
			aria-describedby="banner-hint"
			onclick={() => fileInput?.click()}
		>
			Upload image
		</Button>
		<input
			bind:this={fileInput}
			type="file"
			accept={IMAGE_TYPES.join(',')}
			class="hidden"
			tabindex="-1"
			aria-hidden="true"
			onchange={handleFileSelect}
		/>
		{#if effective.kind !== 'default'}
			<Button variant="ghost" onclick={() => choose({ kind: 'default' })}>Remove</Button>
		{/if}
	</div>

	{#if error}
		<p id="banner-hint" class="text-xs text-destructive">{error}</p>
	{:else}
		<p id="banner-hint" class="text-xs text-text-subtle">
			{draft?.kind === 'image'
				? `${draft.file.name} — saved when you press Save.`
				: 'PNG, JPG, WebP or GIF, up to 5 MB. Cropped to fit.'}
		</p>
	{/if}
</div>
