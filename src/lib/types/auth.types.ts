export type UserProfile = {
	avatar?: string;
	/** `#rrggbb`, lowercase. Never set together with `banner_image`. */
	banner_color?: string;
	/** Media URL from `POST /users/{id}/banner`. */
	banner_image?: string;
};

export type User = {
	id: number;
	username: string;
	public_key: string;
	profile: UserProfile;
	/** Only present on the logged-in user's own profile. */
	is_platform_admin?: boolean;
	/** Only present on the logged-in user's own profile, from /auth/me. */
	max_attachment_bytes?: number;
};
