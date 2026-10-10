export type User = {
	id: number;
	username: string;
	public_key: string;
	profile: Record<string, any>;
	/** Only present on the logged-in user's own profile. */
	is_platform_admin?: boolean;
	/** Only present on the logged-in user's own profile, from /auth/me. */
	max_attachment_bytes?: number;
};
