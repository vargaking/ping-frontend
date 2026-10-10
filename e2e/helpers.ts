import {
	expect,
	type APIRequestContext,
	type Browser,
	type BrowserContext,
	type Page
} from '@playwright/test';

export type TestUser = { id: number; username: string; password: string };

export type NewUser = { context: BrowserContext; page: Page; user: TestUser };

const PASSWORD = 'correct-horse-battery';
let counter = 0;

export function uniqueName(prefix: string) {
	counter += 1;
	return `${prefix}-${Date.now().toString(36)}${counter}`;
}

async function json<T>(response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
	expect(response.ok(), `${response.url()} responded ${response.status()}`).toBe(true);
	return response.json() as Promise<T>;
}

export async function registerUser(context: BrowserContext, name = 'user'): Promise<TestUser> {
	const username = uniqueName(name);
	await json(
		await context.request.post('/auth/register', { data: { username, password: PASSWORD } })
	);
	const me = await json<{ id: number }>(await context.request.get('/auth/me'));
	return { id: me.id, username, password: PASSWORD };
}

export async function createServer(context: BrowserContext, name: string) {
	return json<{ id: number; name: string }>(
		await context.request.post('/servers/', { data: { name } })
	);
}

export async function createCategory(context: BrowserContext, serverId: number, name: string) {
	return json<{ id: number; name: string }>(
		await context.request.post(`/servers/${serverId}/channel-groups`, { data: { name } })
	);
}

export async function createChannel(
	context: BrowserContext,
	serverId: number,
	name: string,
	groupId?: number
) {
	return json<{ id: number; name: string }>(
		await context.request.post(`/channels/${serverId}/create`, {
			data: { name, type: 'text', ...(groupId != null && { group_id: groupId }) }
		})
	);
}

export async function createRole(
	context: BrowserContext,
	serverId: number,
	name: string,
	extra: { allow?: string; parent_id?: number } = {}
) {
	return json<{ id: number; name: string }>(
		await context.request.post(`/servers/${serverId}/roles`, { data: { name, ...extra } })
	);
}

export async function setMemberRoles(
	context: BrowserContext,
	serverId: number,
	userId: number,
	roleIds: number[]
) {
	await json(
		await context.request.put(`/servers/${serverId}/members/${userId}/roles`, {
			data: { role_ids: roleIds }
		})
	);
}

export async function everyoneRoleId(context: BrowserContext, serverId: number) {
	const roles = await json<{ id: number; is_default: boolean }[]>(
		await context.request.get(`/servers/${serverId}/roles`)
	);
	const everyone = roles.find((role) => role.is_default);
	expect(everyone, 'the server should have an @everyone role').toBeDefined();
	return everyone!.id;
}

export async function putOverwrite(
	context: BrowserContext,
	target: 'channels' | 'channel-groups',
	id: number,
	kind: 'roles' | 'members',
	subjectId: number,
	allow: string,
	deny: string
) {
	const response = await context.request.put(`/${target}/${id}/permissions/${kind}/${subjectId}`, {
		data: { allow, deny }
	});
	expect(response.ok(), `${response.url()} responded ${response.status()}`).toBe(true);
}

export async function createInvite(context: BrowserContext, serverId: number) {
	return json<{ id: string }>(
		await context.request.post('/invites/', { data: { server_id: serverId } })
	);
}

export async function joinInvite(context: BrowserContext, inviteId: string) {
	await json(await context.request.post(`/invites/${inviteId}/use`, { data: {} }));
}

export async function openConversation(context: BrowserContext, userId: number) {
	return json<{ id: number }>(
		await context.request.post('/conversations/', { data: { user_id: userId } })
	);
}

export async function newUser(browser: Browser, name = 'user'): Promise<NewUser> {
	const context = await browser.newContext();
	const user = await registerUser(context, name);
	const page = await context.newPage();
	return { context, page, user };
}

export function channelPath(serverId: number, channelId: number) {
	return `/app/server/${serverId}/channel/${channelId}/`;
}

export async function sendMessageViaUi(page: Page, text: string) {
	const composer = page.getByRole('group', { name: 'Message composer' }).getByRole('textbox');
	await composer.fill(text);
	await composer.press('Enter');
	await expect(
		page.getByText(text, { exact: true }),
		`"${text}" should render after sending`
	).toBeVisible();
}

export type SeedThread =
	| { conversationId: number }
	| { serverId: number; channelId: number; postId?: number };

/** Sends messages over a socket of its own, much faster than typing them. */
export async function seedMessages(context: BrowserContext, thread: SeedThread, texts: string[]) {
	const page = await context.newPage();
	await page.goto('/robots.txt');
	await page.evaluate(
		({ thread, texts }) =>
			new Promise<void>((resolve, reject) => {
				const socket = new WebSocket(`wss://${location.host}/ws`);
				const pending = new Set<string>();
				socket.onerror = () => reject(new Error('seeding socket failed'));
				socket.onmessage = (event) => {
					const frame = JSON.parse(event.data);
					if (frame.type === 'error') reject(new Error(`seeding rejected: ${frame.code}`));
					if (frame.type !== 'message_ack') return;
					pending.delete(frame.id);
					if (pending.size === 0) {
						socket.close();
						resolve();
					}
				};
				socket.onopen = () => {
					for (const text of texts) {
						const id = crypto.randomUUID();
						pending.add(id);
						const timestamp = new Date().toISOString();
						socket.send(
							JSON.stringify(
								'conversationId' in thread
									? {
											type: 'direct_message',
											id,
											conversation_id: thread.conversationId,
											content: text,
											timestamp
										}
									: {
											type: 'message',
											id,
											server_id: thread.serverId,
											channel_id: thread.channelId,
											...(thread.postId != null && { post_id: thread.postId }),
											content: text,
											timestamp,
											attachment_ids: []
										}
							)
						);
					}
				};
			}),
		{ thread, texts }
	);
	await page.close();
}

export function seedDirectMessages(
	context: BrowserContext,
	conversationId: number,
	texts: string[]
) {
	return seedMessages(context, { conversationId }, texts);
}

/** Creates a forum channel and a post in it. */
export async function createForumPost(context: BrowserContext, serverId: number, title: string) {
	const channel = await json<{ id: number }>(
		await context.request.post(`/channels/${serverId}/create`, {
			data: { name: 'ideas', type: 'forum' }
		})
	);
	const created = await json<{ post: { id: number } }>(
		await context.request.post(`/channels/${channel.id}/posts`, {
			data: {
				title,
				message: {
					id: crypto.randomUUID(),
					content: 'opening',
					timestamp: new Date().toISOString()
				}
			}
		})
	);
	return { channelId: channel.id, postId: created.post.id };
}
