<script lang="ts">
	import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client';

	type Props = {
		track: RemoteVideoTrack | LocalVideoTrack;
		el?: HTMLVideoElement | null;
		class?: string;
	};

	let { track, el = $bindable(null), class: className = '' }: Props = $props();

	$effect(() => {
		const video = el;
		if (!video) return;
		track.attach(video);
		return () => {
			track.detach(video);
		};
	});
</script>

<!-- Muted: a share's sound plays through the room's audio elements, and your own must not echo. -->
<video
	bind:this={el}
	muted
	autoplay
	playsinline
	class="h-full w-full bg-black object-contain {className}"
></video>
