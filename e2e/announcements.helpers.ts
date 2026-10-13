import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/** There is no API for it, so this runs the server's own script against the e2e database. */
export function makePlatformAdmin(username: string) {
	const cwd =
		process.env.PING_SERVER_DIR ?? (existsSync('ping-server') ? 'ping-server' : '../ping-server');
	const python = process.env.PING_SERVER_PYTHON ?? 'python';
	try {
		execFileSync(python, ['-m', 'app.scripts.platform_admin', username, '--grant'], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe']
		});
	} catch (e) {
		const stderr = (e as { stderr?: string }).stderr;
		throw new Error(`Granting platform admin to ${username} failed: ${stderr || String(e)}`);
	}
}

/** The value of a datetime-local input, which is read as local time, a few minutes from now. */
export function datetimeLocalIn(minutes: number): string {
	const date = new Date(Date.now() + minutes * 60_000);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
