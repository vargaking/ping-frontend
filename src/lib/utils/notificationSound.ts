/**
 * Short blips synthesised with the Web Audio API — no sound asset to ship or
 * license. The context is created lazily and resumed on the first user
 * gesture (autoplay policy); if it never gets resumed, playback is silently
 * skipped rather than logged, since a missed blip isn't worth an error.
 */

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
	if (typeof window === 'undefined') return null;
	const AudioContextCtor = window.AudioContext;
	if (!AudioContextCtor) return null;

	if (!ctx) {
		ctx = new AudioContextCtor();
	}
	return ctx;
}

/** Call once on first pointerdown/keydown so playback is allowed later. */
export function primeNotificationSound() {
	getContext()
		?.resume()
		.catch(() => {
			// Nothing to do: playback just stays silent until a gesture succeeds.
		});
}

function tone(
	context: AudioContext,
	startAt: number,
	freq: number,
	durationMs: number,
	gain: number
) {
	const oscillator = context.createOscillator();
	const gainNode = context.createGain();
	oscillator.type = 'sine';
	oscillator.frequency.value = freq;

	const duration = durationMs / 1000;
	const attack = duration * 0.25;
	const release = duration * 0.5;

	gainNode.gain.setValueAtTime(0, startAt);
	gainNode.gain.linearRampToValueAtTime(gain, startAt + attack);
	gainNode.gain.linearRampToValueAtTime(0, startAt + duration);

	oscillator.connect(gainNode);
	gainNode.connect(context.destination);
	oscillator.start(startAt);
	oscillator.stop(startAt + duration + release);
}

/** Subtle ~100ms blip for an ordinary unread message. */
export function playMessageBlip() {
	const context = getContext();
	if (!context || context.state !== 'running') return;
	tone(context, context.currentTime, 660, 100, 0.05);
}

/** Slightly louder two-tone chime for mentions and DMs. */
export function playMentionChime() {
	const context = getContext();
	if (!context || context.state !== 'running') return;
	const now = context.currentTime;
	tone(context, now, 660, 90, 0.09);
	tone(context, now + 0.09, 880, 130, 0.09);
}
