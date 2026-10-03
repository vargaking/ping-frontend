export const DEFAULT_URL = 'https://zetchat.app';

function parse(raw: string | undefined): URL | null {
	if (!raw) return null;
	try {
		const url = new URL(raw);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('not http(s)');
		return url;
	} catch {
		console.warn(`Ignoring invalid app URL: ${raw}`);
		return null;
	}
}

/** `--url=<origin>` beats `ZET_URL` beats the default. Only http(s). */
export function appUrl(argv: string[], env: NodeJS.ProcessEnv): URL {
	const flag = argv.find((arg) => arg.startsWith('--url='))?.slice('--url='.length);
	return parse(flag) ?? parse(env.ZET_URL) ?? new URL(DEFAULT_URL);
}
