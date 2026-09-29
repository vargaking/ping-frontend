<script lang="ts">
	let { track }: { track: MediaStreamTrack } = $props();

	let level = $state(0);

	$effect(() => {
		const context = new AudioContext();
		const analyser = context.createAnalyser();
		analyser.fftSize = 512;
		const source = context.createMediaStreamSource(new MediaStream([track]));
		source.connect(analyser);
		const samples = new Float32Array(analyser.fftSize);

		let frame = requestAnimationFrame(function tick() {
			analyser.getFloatTimeDomainData(samples);
			let sum = 0;
			for (const s of samples) sum += s * s;
			const rms = Math.sqrt(sum / samples.length);
			// Speech sits around -40 to -10 dBFS; map that range onto the bar.
			const db = 20 * Math.log10(rms || 1e-8);
			level = Math.min(1, Math.max(0, (db + 60) / 50));
			frame = requestAnimationFrame(tick);
		});

		return () => {
			cancelAnimationFrame(frame);
			source.disconnect();
			context.close();
		};
	});
</script>

<div
	role="meter"
	aria-label="Microphone level"
	aria-valuemin={0}
	aria-valuemax={100}
	aria-valuenow={Math.round(level * 100)}
	class="h-2 w-full overflow-hidden rounded-full bg-input"
>
	<div
		class="h-full rounded-full bg-online transition-[width] duration-75"
		style="width: {level * 100}%"
	></div>
</div>
