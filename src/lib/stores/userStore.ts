import { writable } from 'svelte/store';
import type { User } from '$lib/types/auth.types';
import type { Server } from '$lib/types/server.types';

export const UserStore = writable<User | null>(null);

export const UserServersStore = writable<Server[]>([]);
