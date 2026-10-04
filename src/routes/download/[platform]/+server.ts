import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const REPO = 'vargaking/ping-frontend';

const downloads: Record<string, string> = {
	windows: `https://github.com/${REPO}/releases/latest/download/Zet-Setup.exe`,
	linux: `https://github.com/${REPO}/releases/latest/download/Zet.AppImage`
};

export const GET: RequestHandler = ({ params }) => {
	const url = downloads[params.platform];
	if (!url) error(404, 'Not found');
	redirect(302, url);
};
