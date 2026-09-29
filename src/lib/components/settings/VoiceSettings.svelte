<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { voiceState } from '$lib/states/voiceState.svelte';
	import { DEFAULT_DEVICE, voiceSettingsState } from '$lib/states/voiceSettingsState.svelte';
	import { describeMicError } from '$lib/utils/voiceErrors';
	import Button from '$lib/components/ui/button/button.svelte';
	import SettingsSwitch from './SettingsSwitch.svelte';
	import MicLevelMeter from './MicLevelMeter.svelte';

	type Option = { id: string; label: string };

	const selectClass =
		'h-11 w-full rounded-[10px] border border-input bg-surface-input px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

	function optionsFor(devices: MediaDeviceInfo[], saved: string, noun: string): Option[] {
		const options = devices.map((d, i) => ({
			id: d.deviceId,
			label: d.label || `${noun} ${i + 1}`
		}));
		// Firefox and Safari don't list a "default" entry of their own.
		if (!options.some((o) => o.id === DEFAULT_DEVICE)) {
			options.unshift({ id: DEFAULT_DEVICE, label: 'Default' });
		}
		if (!options.some((o) => o.id === saved)) {
			options.push({ id: saved, label: `Saved ${noun.toLowerCase()} (not connected)` });
		}
		return options;
	}

	const inputOptions = $derived(
		optionsFor(voiceSettingsState.inputs, voiceSettingsState.inputId, 'Microphone')
	);
	const outputOptions = $derived(
		optionsFor(voiceSettingsState.outputs, voiceSettingsState.outputId, 'Output')
	);

	let testTrack = $state<MediaStreamTrack | null>(null);
	// Only set when the test opened its own capture, which must be stopped again.
	let testStream: MediaStream | null = null;

	onMount(() => {
		const refresh = () => voiceSettingsState.refreshDevices().catch(() => {});
		refresh();
		navigator.mediaDevices?.addEventListener('devicechange', refresh);
		return () => navigator.mediaDevices?.removeEventListener('devicechange', refresh);
	});

	function stopTest() {
		testStream?.getTracks().forEach((t) => t.stop());
		testStream = null;
		testTrack = null;
	}

	onDestroy(stopTest);

	async function startTest() {
		stopTest();
		// In a call with the mic live, measure what the others hear.
		const live = voiceState.micTrack;
		if (live && !voiceState.micOff) {
			testTrack = live;
			return;
		}
		try {
			const { deviceId, noiseSuppression, echoCancellation } = voiceSettingsState.captureOptions();
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: { deviceId, noiseSuppression, echoCancellation }
			});
			testStream = stream;
			testTrack = stream.getAudioTracks()[0] ?? null;
			if (voiceSettingsState.labelsHidden) voiceSettingsState.refreshDevices().catch(() => {});
		} catch (err) {
			toast.error(describeMicError(err));
		}
	}

	/** Picks up a new device or processing setting in a running test. */
	function retest() {
		if (testTrack) startTest();
	}

	async function showDeviceNames() {
		try {
			await voiceSettingsState.refreshDevices(true);
		} catch (err) {
			toast.error(describeMicError(err));
		}
	}

	async function pickInput(event: Event) {
		const id = (event.currentTarget as HTMLSelectElement).value;
		try {
			await voiceState.setInputDevice(id);
		} catch (err) {
			toast.error(describeMicError(err));
		}
		retest();
	}

	async function pickOutput(event: Event) {
		const id = (event.currentTarget as HTMLSelectElement).value;
		try {
			await voiceState.setOutputDevice(id);
		} catch {
			toast.error("Couldn't switch to that output device.");
		}
	}

	async function setProcessing(next: { noiseSuppression?: boolean; echoCancellation?: boolean }) {
		try {
			await voiceState.setAudioProcessing(next);
		} catch (err) {
			toast.error(describeMicError(err));
		}
		retest();
	}
</script>

<div class="flex max-w-md flex-col gap-6">
	<p class="text-xs text-text-subtle">
		Saved on this device. Changes apply right away, also during a call.
	</p>

	<div class="flex flex-col gap-1.5">
		<label for="voice-input" class="text-[13px] font-medium text-text-label">Microphone</label>
		<select
			id="voice-input"
			class={selectClass}
			value={voiceSettingsState.inputId}
			onchange={pickInput}
		>
			{#each inputOptions as option (option.id)}
				<option value={option.id}>{option.label}</option>
			{/each}
		</select>
		{#if voiceSettingsState.labelsHidden}
			<p class="text-xs text-text-subtle">
				Device names are hidden until zeta may use your microphone.
				<button
					type="button"
					class="text-foreground underline underline-offset-2 hover:no-underline"
					onclick={showDeviceNames}
				>
					Show names
				</button>
			</p>
		{/if}
	</div>

	<div class="flex flex-col gap-2">
		<span class="text-[13px] font-medium text-text-label">Mic check</span>
		{#if testTrack}
			<MicLevelMeter track={testTrack} />
			<Button variant="secondary" class="w-fit" onclick={stopTest}>Stop</Button>
		{:else}
			<p class="text-xs text-text-subtle">Talk and watch the bar move.</p>
			<Button variant="secondary" class="w-fit border border-input" onclick={startTest}>
				Check mic
			</Button>
		{/if}
	</div>

	<div class="flex flex-col gap-1.5">
		{#if voiceSettingsState.outputSupported}
			<label for="voice-output" class="text-[13px] font-medium text-text-label">Output</label>
			<select
				id="voice-output"
				class={selectClass}
				value={voiceSettingsState.outputId}
				onchange={pickOutput}
			>
				{#each outputOptions as option (option.id)}
					<option value={option.id}>{option.label}</option>
				{/each}
			</select>
		{:else}
			<span class="text-[13px] font-medium text-text-label">Output</span>
			<p class="text-sm text-muted-foreground">
				This browser plays voice through your system's output device. Change it in your system sound
				settings.
			</p>
		{/if}
	</div>

	<div class="flex flex-col gap-5">
		<SettingsSwitch
			label="Noise suppression"
			description="Filters out steady background noise like fans and keyboards."
			checked={voiceSettingsState.noiseSuppression}
			onclick={() => setProcessing({ noiseSuppression: !voiceSettingsState.noiseSuppression })}
		/>
		<SettingsSwitch
			label="Echo cancellation"
			description="Stops others hearing themselves when you use speakers instead of headphones."
			checked={voiceSettingsState.echoCancellation}
			onclick={() => setProcessing({ echoCancellation: !voiceSettingsState.echoCancellation })}
		/>
	</div>
</div>
