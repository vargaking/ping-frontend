<script lang="ts">
    import { overlayState } from '$lib/states/overlayState.svelte';
    import { fade, scale } from 'svelte/transition';

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            overlayState.close();
        }
    }

    function handleBackdropClick(event: MouseEvent) {
        if (event.target === event.currentTarget) {
            overlayState.close();
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if overlayState.isOpen && overlayState.component}
    <!-- Backdrop -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onclick={handleBackdropClick}
        onkeydown={handleKeydown}
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        transition:fade={{ duration: 200 }}
    >
        <!-- Content -->
        <div
            class="relative max-h-[90vh] max-w-[90vw] overflow-auto rounded-lg shadow-2xl"
            transition:scale={{ duration: 200, start: 0.95 }}
        >
            <overlayState.component {...overlayState.props} />
        </div>
    </div>
{/if}
