import { Room, type AudioCaptureOptions, type RoomOptions } from 'livekit-client';
import {
	DEFAULT_SCREEN_CONTENT,
	DEFAULT_SCREEN_PRESET,
	SCREEN_CONTENT_LABELS,
	SCREEN_PRESETS,
	type ScreenContent,
	type ScreenPresetId
} from '$lib/utils/screenShare';

const STORAGE_KEY = 'voice.devices';
/** The browser's own default device, as enumerateDevices reports it in Chrome. */
export const DEFAULT_DEVICE = 'default';

type Prefs = {
	inputId: string;
	outputId: string;
	noiseSuppression: boolean;
	echoCancellation: boolean;
	screenPreset: ScreenPresetId;
	screenContent: ScreenContent;
};

const DEFAULTS: Prefs = {
	inputId: DEFAULT_DEVICE,
	outputId: DEFAULT_DEVICE,
	noiseSuppression: true,
	echoCancellation: true,
	screenPreset: DEFAULT_SCREEN_PRESET,
	screenContent: DEFAULT_SCREEN_CONTENT
};

function loadPrefs(): Prefs {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const saved = JSON.parse(raw);
			return {
				inputId: typeof saved.inputId === 'string' ? saved.inputId : DEFAULTS.inputId,
				outputId: typeof saved.outputId === 'string' ? saved.outputId : DEFAULTS.outputId,
				noiseSuppression: saved.noiseSuppression !== false,
				echoCancellation: saved.echoCancellation !== false,
				screenPreset: Object.hasOwn(SCREEN_PRESETS, saved.screenPreset)
					? saved.screenPreset
					: DEFAULTS.screenPreset,
				screenContent: Object.hasOwn(SCREEN_CONTENT_LABELS, saved.screenContent)
					? saved.screenContent
					: DEFAULTS.screenContent
			};
		}
	} catch {
		/* unavailable or malformed: fall back to defaults */
	}
	return { ...DEFAULTS };
}

/** Local audio device and processing choices. Applying them to a live call
 *  is voiceState's job; this only stores them and lists devices. */
class VoiceSettingsState {
	inputId = $state(DEFAULTS.inputId);
	outputId = $state(DEFAULTS.outputId);
	noiseSuppression = $state(DEFAULTS.noiseSuppression);
	echoCancellation = $state(DEFAULTS.echoCancellation);
	screenPreset = $state(DEFAULTS.screenPreset);
	screenContent = $state(DEFAULTS.screenContent);

	inputs = $state<MediaDeviceInfo[]>([]);
	outputs = $state<MediaDeviceInfo[]>([]);
	/** Device names are hidden until the site has been allowed to use the mic. */
	labelsHidden = $state(false);

	/** Picking an output device needs setSinkId, which Firefox and Safari lack or gate. */
	readonly outputSupported =
		typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

	constructor() {
		if (typeof window !== 'undefined') Object.assign(this, loadPrefs());
	}

	save(next: Partial<Prefs>) {
		Object.assign(this, next);
		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					inputId: this.inputId,
					outputId: this.outputId,
					noiseSuppression: this.noiseSuppression,
					echoCancellation: this.echoCancellation,
					screenPreset: this.screenPreset,
					screenContent: this.screenContent
				})
			);
		} catch {
			/* storage blocked: the choice just won't survive a reload */
		}
	}

	async refreshDevices(requestPermission = false) {
		const devices = await Room.getLocalDevices(undefined, requestPermission);
		this.inputs = devices.filter((d) => d.kind === 'audioinput');
		this.outputs = devices.filter((d) => d.kind === 'audiooutput');
		this.labelsHidden = devices.some((d) => d.kind === 'audioinput' && !d.label);
	}

	/** Whether a saved device is still plugged in. Unknown until devices are listed. */
	isAvailable(kind: 'audioinput' | 'audiooutput', id: string): boolean {
		if (id === DEFAULT_DEVICE) return true;
		const list = kind === 'audioinput' ? this.inputs : this.outputs;
		return list.length === 0 || list.some((d) => d.deviceId === id);
	}

	captureOptions(): AudioCaptureOptions {
		return {
			// A plain id is only a preference, so a missing device falls back to the default.
			deviceId: this.inputId === DEFAULT_DEVICE ? undefined : this.inputId,
			noiseSuppression: this.noiseSuppression,
			echoCancellation: this.echoCancellation,
			autoGainControl: true
		};
	}

	roomOptions(): Partial<RoomOptions> {
		return {
			audioCaptureDefaults: this.captureOptions(),
			audioOutput:
				this.outputSupported && this.outputId !== DEFAULT_DEVICE
					? { deviceId: this.outputId }
					: undefined
		};
	}
}

export const voiceSettingsState = new VoiceSettingsState();
