<script lang="ts">
	import type { MessageType } from '$lib/types/messages.types';
	import MessageNode from './MessageNode.svelte';

	let { message }: { message: MessageType } = $props();

	const parsedContent = $derived.by(() => {
		// `content` is typed as JSONContent, but legacy rows can still be strings.
		const raw: unknown = message.content;
		if (typeof raw === 'string') {
			try {
				return JSON.parse(raw);
			} catch {
				try {
					// Fallback for Python-style stringified dicts (single quotes / None).
					const fixed = raw
						.replace(/'/g, '"')
						.replace(/False/g, 'false')
						.replace(/True/g, 'true')
						.replace(/None/g, 'null');
					return JSON.parse(fixed);
				} catch {
					return message.content; // legacy plain-string message
				}
			}
		}
		return message.content;
	});

	const hoverTime = $derived(
		new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
	);
</script>

<div class="group/row relative">
	<span
		class="pointer-events-none absolute top-0.5 -left-12 hidden w-11 pr-2 text-right font-mono text-[11px] text-text-subtle select-none group-hover/row:block"
		aria-hidden="true"
	>
		{hoverTime}
	</span>
	<div
		class="prose prose-sm max-w-none text-[15px] leading-[1.55] break-words whitespace-pre-wrap text-text-body prose-invert"
	>
		<MessageNode node={parsedContent} />
	</div>
</div>
