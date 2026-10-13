import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
	options: {
		root: { type: 'string', default: process.cwd() },
		profile: { type: 'string', default: join(tmpdir(), 'search-perf-profile') },
		seed: { type: 'boolean', default: false },
		rows: { type: 'string', default: '100000' },
		runs: { type: 'string', default: '9' }
	}
});

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(values.root);
const origin = 'http://search-perf.local';

const { outputFiles } = await build({
	entryPoints: [join(here, 'entry.ts')],
	bundle: true,
	write: false,
	format: 'iife',
	target: 'es2022',
	alias: { $lib: join(root, 'src/lib') },
	nodePaths: [join(root, 'node_modules')]
});
const bundle = outputFiles[0].text;

mkdirSync(values.profile, { recursive: true });
const context = await chromium.launchPersistentContext(values.profile, { headless: true });
const page = await context.newPage();
await page.route(`${origin}/**`, (route) => {
	if (new URL(route.request().url()).pathname === '/bundle.js') {
		return route.fulfill({ contentType: 'text/javascript', body: bundle });
	}
	return route.fulfill({
		contentType: 'text/html',
		body: '<!doctype html><script src="/bundle.js"></script>'
	});
});
await page.goto(origin);

if (values.seed) {
	const started = Date.now();
	const count = await page.evaluate((rows) => globalThis.perf.seed(rows), Number(values.rows));
	console.log(`seeded ${count} rows in ${Math.round((Date.now() - started) / 1000)} s`);
}

const everywhere = { kind: 'everywhere' };
const server = { kind: 'server', serverId: 1 };
const smallChannel = { kind: 'channel', channelId: 99 };
const queries = [
	{ name: 'date only, every row matches', input: 'before:2027-01-01', scope: everywhere },
	{ name: 'server + after:', input: 'after:2025-01-01', scope: server },
	{ name: 'server + has:file', input: 'has:file', scope: server },
	{
		name: 'server + from:<imported> + has:file',
		input: 'from:"Old Name" has:file',
		scope: server
	},
	{ name: 'has:image', input: 'has:image', scope: everywhere },
	{ name: 'has:file', input: 'has:file', scope: everywhere },
	{ name: 'has:link', input: 'has:link', scope: everywhere },
	{ name: 'from:<user>', input: 'from:user7', scope: everywhere },
	{ name: 'from:<imported>', input: 'from:"Old Name"', scope: everywhere },
	{ name: 'during:2025-06', input: 'during:2025-06', scope: everywhere },
	{
		name: 'from:<imported> has:image after:2023',
		input: 'from:"Old Name" has:image after:2023-01-01',
		scope: everywhere
	},
	{ name: 'mirage has:image', input: 'mirage has:image', scope: everywhere },
	{ name: 'small channel + has:file', input: 'has:file', scope: smallChannel },
	{ name: 'small channel + after:', input: 'after:2025-01-01', scope: smallChannel }
];

const results = await page.evaluate(({ queries, runs }) => globalThis.perf.bench(queries, runs), {
	queries,
	runs: Number(values.runs)
});
await context.close();

console.log(`first page of 30, median of ${values.runs} runs after one warm-up`);
console.log(
	'name'.padEnd(40),
	'median'.padStart(8),
	'min'.padStart(6),
	'max'.padStart(6),
	' rows  id hash'
);
for (const r of results) {
	const hash = createHash('sha1').update(r.ids).digest('hex').slice(0, 8);
	console.log(
		r.name.padEnd(40),
		`${r.median.toFixed(0)} ms`.padStart(8),
		r.min.toFixed(0).padStart(6),
		r.max.toFixed(0).padStart(6),
		String(r.count).padStart(5),
		' ',
		hash
	);
}
