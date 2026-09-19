<script lang="ts">
	import { overlayState } from '$lib/states/overlayState.svelte';
	import { fade, scale } from 'svelte/transition';

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			overlayState.close();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if overlayState.isOpen && overlayState.component}
	<div class="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
		<!-- Backdrop: a real button so clicking (or Enter/Space) closes the overlay -->
		<button
			type="button"
			aria-label="Close"
			class="absolute inset-0 bg-background/80 backdrop-blur-sm"
			onclick={() => overlayState.close()}
			transition:fade={{ duration: 200 }}
		></button>

		<!-- Content -->
		<div
			class="relative max-h-[90vh] max-w-[90vw] overflow-auto rounded-lg shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
			transition:scale={{ duration: 200, start: 0.95 }}
		>
			<overlayState.component {...overlayState.props} />
		</div>
	</div>
{/if}
