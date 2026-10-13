<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { PUBLIC_BASE_URL } from '$env/static/public';
	import { gameApiUrl, pluginConfig } from '$lib/utils/gameKey';
	import * as Dialog from '$lib/components/ui/dialog/index';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Check, Copy } from 'lucide-svelte';

	const COPIED_MS = 2000;

	type Props = {
		/** The key is only known right after it is made; closing forgets it. */
		reveal: { name: string; key: string } | null;
		onclose: () => void;
	};

	let { reveal, onclose }: Props = $props();

	let copied = $state(false);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;

	const snippet = $derived(
		reveal ? pluginConfig(gameApiUrl(PUBLIC_BASE_URL, window.location.origin), reveal.key) : ''
	);

	$effect(() => () => clearTimeout(copiedTimer));

	async function copy() {
		try {
			await navigator.clipboard.writeText(snippet);
		} catch {
			toast.error("Couldn't copy. Select the text and copy it manually.");
			return;
		}
		copied = true;
		clearTimeout(copiedTimer);
		copiedTimer = setTimeout(() => (copied = false), COPIED_MS);
	}
</script>

<Dialog.Root
	open={reveal != null}
	onOpenChange={(open) => {
		if (!open) {
			copied = false;
			onclose();
		}
	}}
>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Key for {reveal?.name}</Dialog.Title>
			<Dialog.Description>
				Copy this now. The key is shown once and can't be looked up again.
			</Dialog.Description>
		</Dialog.Header>
		<div class="flex flex-col gap-3">
			<textarea
				readonly
				rows="2"
				aria-label="Plugin configuration"
				value={snippet}
				onfocus={(e) => e.currentTarget.select()}
				class="w-full resize-none rounded-[10px] border border-input bg-surface-input px-3 py-2.5 font-mono text-[13px] break-all text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
			></textarea>
			<p class="text-xs text-text-subtle">
				Paste this into plugins/ZetVoice/config.yml and run /zeta reload.
			</p>
		</div>
		<Dialog.Footer>
			<Button variant="secondary" onclick={onclose}>Done</Button>
			<Button onclick={copy}>
				{#if copied}
					<Check size={16} strokeWidth={1.75} />
					Copied
				{:else}
					<Copy size={16} strokeWidth={1.75} />
					Copy
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
