/** A channel or a category whose permission overwrites are edited. */
export type OverwriteTarget = { kind: 'channel' | 'group'; id: number };

export type OverwriteSubject = { kind: 'roles' | 'members'; id: number };

/** Masks are decimal strings, like role masks. */
export type RoleOverwrite = { role_id: number; allow: string; deny: string };
export type MemberOverwrite = { user_id: number; allow: string; deny: string };

export type Overwrites = { roles: RoleOverwrite[]; members: MemberOverwrite[] };

/** A saved change to one overwrite row; `overwrite` is null when the row was removed. */
export type OverwriteFrame = {
	type: 'permission_overwrite_updated';
	server_id: number;
	target: 'channel' | 'group';
	target_id: number;
	subject: 'role' | 'member';
	subject_id: number;
	overwrite: RoleOverwrite | MemberOverwrite | null;
};
