import type { MessageType } from '$lib/types/messages.types';
import { writable } from 'svelte/store';

export const MessageStore = writable<MessageType[]>([]);
