import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const web = new URL('../../src/lib/', import.meta.url);
const out = (name) => fileURLToPath(new URL(`assets/${name}`, root));

const favicon = await readFile(new URL('assets/favicon.svg', web));
// The mark's padding is meant for larger sizes; at tray size it would shrink the Z to a few pixels.
const mark = (await readFile(new URL('brand/mark.svg', web)))
	.toString()
	.replace('viewBox="0 0 512 512"', 'viewBox="106 106 300 300"');

const unreadMark = mark
	.replace(
		'<mask id="cut">',
		'<mask id="ring"><rect width="512" height="512" fill="#fff" /><circle cx="350" cy="162" r="92" fill="#000" /></mask>\n\t<mask id="cut">'
	)
	.replace(/<g fill="none"/, '<g mask="url(#ring)" fill="none"')
	.replace('</svg>', '\t<circle cx="350" cy="162" r="56" fill="#8ab4d8" />\n</svg>');

const overlay = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
	<circle cx="32" cy="32" r="30" fill="#0d0f11" />
	<circle cx="32" cy="32" r="22" fill="#8ab4d8" />
</svg>`;

async function render(svg, size) {
	return sharp(Buffer.from(svg), { density: 1024 }).resize(size, size).png().toBuffer();
}

async function save(name, svg, size) {
	await writeFile(out(name), await render(svg, size));
}

await save('icon.png', favicon, 512);

const icoSizes = [16, 24, 32, 48, 64, 256];
const icoPngs = await Promise.all(icoSizes.map((size) => render(favicon, size)));
await writeFile(out('icon.ico'), await pngToIco(icoPngs));

await save('tray.png', mark, 16);
await save('tray@2x.png', mark, 32);
await save('tray-unread.png', unreadMark, 16);
await save('tray-unread@2x.png', unreadMark, 32);
await save('overlay.png', overlay, 16);
await save('overlay@2x.png', overlay, 32);
