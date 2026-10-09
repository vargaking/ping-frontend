const USERNAME_RE = /^[A-Za-z0-9._-]+$/;

/** The server's username rule, as a message for the field, or null when it passes. */
export function usernameProblem(username: string): string | null {
	if (!username) return 'Username is required.';
	if (username.length < 3) return 'Username must be at least 3 characters.';
	if (username.length > 32) return 'Username must be 32 characters or fewer.';
	if (!USERNAME_RE.test(username)) return 'Use only letters, numbers, and . _ -';
	return null;
}
