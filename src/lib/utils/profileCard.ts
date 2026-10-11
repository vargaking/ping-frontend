import type { User, UserProfile } from '$lib/types/auth.types';
import type { MenuEntry } from '$lib/utils/menuActions';

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Why the server would refuse this avatar or banner file, or null when it looks fine. */
export function imageProblem(file: { type: string; size: number }): string | null {
	if (!IMAGE_TYPES.includes(file.type)) return 'Use a PNG, JPG, WebP or GIF image.';
	if (file.size > IMAGE_MAX_BYTES) return 'That image is over 5 MB.';
	return null;
}

export const BANNER_COLOR = /^#[0-9a-f]{6}$/;

export const BANNER_PRESETS = [
	'#e5484d',
	'#f76b15',
	'#ffc53d',
	'#30a46c',
	'#12a594',
	'#0090ff',
	'#6e56cf',
	'#d6409f'
] as const;

export type Banner =
	| { kind: 'default' }
	| { kind: 'color'; color: string }
	| { kind: 'image'; src: string };

/** An image wins over a colour; a colour the server would not have stored is ignored. */
export function bannerOf(profile: UserProfile | null | undefined): Banner {
	if (profile?.banner_image) return { kind: 'image', src: profile.banner_image };
	const color = profile?.banner_color;
	if (typeof color === 'string' && BANNER_COLOR.test(color)) return { kind: 'color', color };
	return { kind: 'default' };
}

export type BannerDraft =
	| { kind: 'default' }
	| { kind: 'color'; color: string }
	| { kind: 'image'; file: File };

export type BannerRequest =
	| { kind: 'remove' }
	| { kind: 'color'; color: string }
	| { kind: 'upload'; file: File };

/** What saving the draft has to send, or null when it matches what is saved. */
export function bannerRequest(saved: Banner, draft: BannerDraft | null): BannerRequest | null {
	if (!draft) return null;
	if (draft.kind === 'image') return { kind: 'upload', file: draft.file };
	if (draft.kind === 'color') {
		return saved.kind === 'color' && saved.color === draft.color
			? null
			: { kind: 'color', color: draft.color };
	}
	return saved.kind === 'default' ? null : { kind: 'remove' };
}

export type CardStatus = 'loading' | 'member' | 'direct' | 'left' | 'missing' | 'imported';

export function cardStatus(input: {
	imported: boolean;
	userId: number | null;
	user: User | null | undefined;
	serverId: number | null;
	/** Null while the server's member list is not known. */
	memberIds: number[] | null;
}): CardStatus {
	const { imported, userId, user, serverId, memberIds } = input;
	if (imported) return 'imported';
	const inServer = serverId != null && memberIds != null;
	if (inServer && (userId == null || !memberIds.includes(userId))) return 'left';
	if (user === undefined) return 'loading';
	if (user === null) return inServer ? 'left' : 'missing';
	return inServer ? 'member' : 'direct';
}

/** The entries with each action closing the card before it runs; submenu toggles are left alone. */
export function closingFirst(actions: MenuEntry[], close: () => void): MenuEntry[] {
	return actions.map((action) =>
		'toggles' in action
			? action
			: {
					...action,
					run: () => {
						close();
						return action.run();
					}
				}
	);
}
