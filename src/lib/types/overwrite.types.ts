/** A channel or a category whose permission overwrites are edited. */
export type OverwriteTarget = { kind: 'channel' | 'group'; id: number };

export type OverwriteSubject = { kind: 'roles' | 'members'; id: number };

/** Masks are decimal strings, like role masks. */
export type RoleOverwrite = { role_id: number; allow: string; deny: string };
export type MemberOverwrite = { user_id: number; allow: string; deny: string };

export type Overwrites = { roles: RoleOverwrite[]; members: MemberOverwrite[] };
