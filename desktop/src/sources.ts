import { desktopCapturer, type DesktopCapturerSource } from 'electron';

export type ScreenSource = {
	id: string;
	name: string;
	kind: 'screen' | 'window';
	thumbnail: string;
	icon?: string;
};

export function toScreenSource(source: DesktopCapturerSource): ScreenSource {
	return {
		id: source.id,
		name: source.name,
		kind: source.id.startsWith('screen:') ? 'screen' : 'window',
		thumbnail: source.thumbnail.toDataURL(),
		icon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : undefined
	};
}

/** Everything that can be shared, minus the given window's own media source. */
export async function listSources(excludeId?: string): Promise<DesktopCapturerSource[]> {
	const sources = await desktopCapturer.getSources({
		types: ['screen', 'window'],
		thumbnailSize: { width: 480, height: 270 },
		fetchWindowIcons: true
	});
	return sources.filter((source) => source.id !== excludeId);
}
