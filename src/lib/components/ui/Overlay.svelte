<script lang="ts">
    import { OverlayStore, closeOverlay } from '$lib/stores/overlayStore';
    import { fade, scale } from 'svelte/transition';

    // Close on escape key
    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            closeOverlay();
        }
    }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $OverlayStore}
    <!-- Backdrop -->
    <div 
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        on:click|self={closeOverlay}
        on:keydown={(e) => e.key === 'Escape' && closeOverlay()}
        role="button"
        tabindex="0"
        transition:fade={{ duration: 200 }}
    >
        <!-- Content -->
        <div 
            class="relative max-h-[90vh] max-w-[90vw] overflow-auto rounded-lg shadow-2xl"
            transition:scale={{ duration: 200, start: 0.95 }}
        >
            <svelte:component 
                this={$OverlayStore.component} 
                {...$OverlayStore.props} 
            />
        </div>
    </div>
{/if}
