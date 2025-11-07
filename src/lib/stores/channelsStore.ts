import type { Channel } from '$lib/types/channel.types';
import { writable } from 'svelte/store';

export const UserChannelsStore = writable<Channel[]>([]);
