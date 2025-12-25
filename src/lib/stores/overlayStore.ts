import { writable } from 'svelte/store';
import type { ComponentType } from 'svelte';

export interface OverlayState {
    component: ComponentType;
    props?: Record<string, any>;
}

export const OverlayStore = writable<OverlayState | null>(null);

export const openOverlay = (component: ComponentType, props: Record<string, any> = {}) => {
    OverlayStore.set({ component, props });
};

export const closeOverlay = () => {
    OverlayStore.set(null);
};
