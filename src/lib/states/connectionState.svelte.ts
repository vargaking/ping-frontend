import { PUBLIC_WS_URL } from '$env/static/public';
import { env } from '$env/dynamic/public';
import { hostOf } from '$lib/utils/host';
import { SITE_NAME } from '$lib/meta';
import { voiceState } from './voiceState.svelte';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type VoiceQuality = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';

export interface ConnectionInfo {
	status: ConnectionStatus;
	/** Rolling median of the last 5 pong RTTs; null when unknown. */
	rttMs: number | null;
	/** Date.now() of the last frame received; null before any. */
	lastSeenAt: number | null;
}

export interface VoiceLink {
	serverId: number;
	status: ConnectionStatus;
	quality: VoiceQuality;
}

export interface IdentityLink {
	host: string;
	status: ConnectionStatus;
	rttMs: number | null;
}

const RTT_SAMPLES = 5;
const IDENTITY_TIMEOUT_MS = 5000;

/** The host the WebSocket connects to. */
export const serverHost = hostOf(PUBLIC_WS_URL);

/** DMs aren't tied to a joined server, so their link gets its own name. */
export const DM_SERVER_NAME = `${SITE_NAME} DM server`;

export function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

class ConnectionState {
	connections: Record<string, ConnectionInfo> = $state({});
	identity: IdentityLink | null = $state(
		env.PUBLIC_IDENTITY_URL
			? { host: hostOf(env.PUBLIC_IDENTITY_URL), status: 'connecting', rttMs: null }
			: null
	);

	private samples = new Map<string, number[]>();

	readonly voice: VoiceLink | null = $derived.by(() => {
		if (voiceState.serverId == null) return null;
		const status: ConnectionStatus = voiceState.reconnecting
			? 'reconnecting'
			: voiceState.connecting
				? 'connecting'
				: voiceState.connected
					? 'connected'
					: 'disconnected';
		return { serverId: voiceState.serverId, status, quality: voiceState.quality };
	});

	get(host: string): ConnectionInfo | undefined {
		return this.connections[host];
	}

	private entry(host: string): ConnectionInfo {
		this.connections[host] ??= { status: 'connecting', rttMs: null, lastSeenAt: null };
		return this.connections[host];
	}

	setStatus(host: string, status: ConnectionStatus) {
		const info = this.entry(host);
		info.status = status;
		if (status !== 'connected') this.resetRtt(host);
	}

	noteFrame(host: string) {
		this.entry(host).lastSeenAt = Date.now();
	}

	addRttSample(host: string, ms: number) {
		const info = this.entry(host);
		if (info.status !== 'connected') return;
		const samples = [...(this.samples.get(host) ?? []), ms].slice(-RTT_SAMPLES);
		this.samples.set(host, samples);
		info.rttMs = Math.round(median(samples));
	}

	resetRtt(host: string) {
		this.samples.delete(host);
		this.entry(host).rttMs = null;
	}

	/** Any HTTP answer, even a 401, proves the identity service is reachable. */
	async checkIdentity() {
		if (!this.identity || !env.PUBLIC_IDENTITY_URL) return;
		const started = performance.now();
		try {
			await fetch(new URL('/auth/me', env.PUBLIC_IDENTITY_URL), {
				credentials: 'include',
				cache: 'no-store',
				signal: AbortSignal.timeout(IDENTITY_TIMEOUT_MS)
			});
			this.identity.status = 'connected';
			this.identity.rttMs = Math.round(performance.now() - started);
		} catch {
			this.identity.status = 'disconnected';
			this.identity.rttMs = null;
		}
	}
}

export const connectionState = new ConnectionState();
