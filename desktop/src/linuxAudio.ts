type PipeWireNode = Record<string, string>;

export type LinkData = {
	exclude: PipeWireNode[];
	ignore_devices: boolean;
	only_speakers: boolean;
	only_default_speakers: boolean;
	mute: boolean;
};

type PatchBay = {
	link(data: LinkData): boolean;
	unlink(): void;
};

/** The part of @vencord/venmic this shell uses. */
export type Venmic = {
	PatchBay: {
		new (): PatchBay;
		hasPipeWire(): boolean;
	};
};

export type AudioStatus = { ok: true } | { ok: false; reason: string };

export type ProcessInfo = { pid: number; type: string; name?: string; serviceName?: string };

/** Shown as "Sound isn't available: <reason>", so reasons are sentence fragments. */
export const REASONS = {
	noModule: "the audio module couldn't be loaded",
	noPipeWire: "PipeWire isn't running",
	noSelf: "Zet's own sound couldn't be told apart",
	linkFailed: "the PC's sound couldn't be linked"
} as const;

/** Chromium plays all sound from its audio service; if that process isn't found, every process of the app is left out. */
export function ownAudioPids(processes: ProcessInfo[]): number[] {
	const audio = processes.filter(
		(p) =>
			p.type === 'Utility' &&
			(p.serviceName === 'audio.mojom.AudioService' || p.name === 'Audio Service')
	);
	return (audio.length > 0 ? audio : processes).map((p) => p.pid);
}

/** Everything the system plays except the app itself, so the call never comes back through the stream. */
export function linkData(own: { pids: number[]; names: string[] }): LinkData {
	return {
		exclude: [
			...own.pids.map((pid) => ({ 'application.process.id': String(pid) })),
			...own.names.map((name) => ({ 'application.name': name }))
		],
		ignore_devices: true,
		only_speakers: true,
		only_default_speakers: true,
		mute: false
	};
}

type Deps = {
	load: () => Venmic;
	processes: () => ProcessInfo[];
	appNames: () => string[];
};

export function createLinuxAudio({ load, processes, appNames }: Deps) {
	let venmic: Venmic | null = null;
	let patchBay: PatchBay | null = null;
	let linked = false;

	function loadVenmic(): Venmic | null {
		if (venmic) return venmic;
		try {
			venmic = load();
		} catch (error) {
			console.warn('Could not load venmic', error);
		}
		return venmic;
	}

	/** Whether sound can be captured now, and if not, why. */
	function status(): AudioStatus {
		const addon = loadVenmic();
		if (!addon) return { ok: false, reason: REASONS.noModule };
		try {
			if (!addon.PatchBay.hasPipeWire()) return { ok: false, reason: REASONS.noPipeWire };
		} catch (error) {
			console.warn('Could not ask PipeWire', error);
			return { ok: false, reason: REASONS.noPipeWire };
		}
		return { ok: true };
	}

	function start(): AudioStatus {
		const ready = status();
		if (!ready.ok || !venmic) return ready;
		const own = { pids: ownAudioPids(processes()), names: appNames() };
		if (own.pids.length === 0 && own.names.length === 0) {
			return { ok: false, reason: REASONS.noSelf };
		}
		try {
			patchBay ??= new venmic.PatchBay();
			if (!patchBay.link(linkData(own))) return { ok: false, reason: REASONS.linkFailed };
		} catch (error) {
			console.warn('Could not link the system sound', error);
			return { ok: false, reason: REASONS.linkFailed };
		}
		linked = true;
		return { ok: true };
	}

	function stop() {
		if (!linked) return;
		linked = false;
		try {
			patchBay?.unlink();
		} catch (error) {
			console.warn('Could not unlink the system sound', error);
		}
	}

	return { status, start, stop };
}
