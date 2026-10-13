import { expect, test, type BrowserContext } from '@playwright/test';

type Embed = {
	url: string;
	site_name: string | null;
	title: string | null;
	description: string | null;
	image_url: string | null;
};

type Post = { text: string; embeds?: Embed[] };

/** The shareable link to an invite on the app under test. */
export function inviteUrl(code: string) {
	const baseURL = test.info().project.use.baseURL;
	expect(baseURL, 'the project should set a baseURL').toBeDefined();
	return `${baseURL}/invite/${code}/`;
}

/** The preview card an older client attached to a message that linked to this url. */
export function landingPageEmbed(url: string): Embed {
	return {
		url,
		site_name: 'Ping',
		title: 'Landing page preview',
		description: null,
		image_url: null
	};
}

export async function createInviteWith(
	context: BrowserContext,
	serverId: number,
	extra: { password?: string } = {}
) {
	const response = await context.request.post('/invites/', {
		data: { server_id: serverId, ...extra }
	});
	expect(response.ok(), `creating an invite responded ${response.status()}`).toBe(true);
	return (await response.json()) as { id: string };
}

export async function revokeInvite(context: BrowserContext, code: string) {
	const response = await context.request.put(`/invites/${code}`, { data: { is_active: false } });
	expect(response.ok(), `revoking the invite responded ${response.status()}`).toBe(true);
}

export async function deleteInvite(context: BrowserContext, code: string) {
	const response = await context.request.delete(`/invites/${code}`);
	expect(response.status(), 'deleting the invite').toBe(204);
}

/** Sends direct messages over a socket of its own, which can also carry link preview embeds. */
export async function postDirectMessages(
	context: BrowserContext,
	conversationId: number,
	posts: Post[]
) {
	const page = await context.newPage();
	await page.goto('/robots.txt');
	await page.evaluate(
		({ conversationId, posts }) =>
			new Promise<void>((resolve, reject) => {
				const socket = new WebSocket(`wss://${location.host}/ws`);
				const pending = new Set<string>();
				socket.onerror = () => reject(new Error('posting socket failed'));
				socket.onmessage = (event) => {
					const frame = JSON.parse(event.data);
					if (frame.type === 'error') reject(new Error(`post rejected: ${frame.code}`));
					if (frame.type !== 'message_ack') return;
					pending.delete(frame.id);
					if (pending.size === 0) {
						socket.close();
						resolve();
					}
				};
				socket.onopen = () => {
					for (const post of posts) {
						const id = crypto.randomUUID();
						pending.add(id);
						socket.send(
							JSON.stringify({
								type: 'direct_message',
								id,
								conversation_id: conversationId,
								content: post.text,
								timestamp: new Date().toISOString(),
								attachment_ids: [],
								embeds: post.embeds ?? []
							})
						);
					}
				};
			}),
		{ conversationId, posts }
	);
	await page.close();
}
