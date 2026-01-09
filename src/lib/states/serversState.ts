import type { Server } from '$lib/types/server.types';

export class ServersState {
	servers: Record<number, Server> = $state({});
	selectedServerId: number | null = $state(null);
	se;
}
