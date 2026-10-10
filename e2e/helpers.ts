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

/** The server comes back without channels, whether or not the backend seeds default ones. */
export async function createServer(context: BrowserContext, name: string) {
	const server = await json<{ id: number; name: string }>(
		await context.request.post('/servers/', { data: { name } })
	);
	await clearChannels(context, server.id);
	return server;
}

export async function clearChannels(context: BrowserContext, serverId: number) {
	const { channels } = await json<{ channels: { id: number }[] }>(
		await context.request.get(`/servers/${serverId}/channels`)
	);
	for (const { id } of channels) {
		const response = await context.request.delete(`/channels/${id}`);
		expect(response.status(), `deleting channel ${id}`).toBe(204);
	}
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

/** Sends direct messages over a socket of its own, much faster than typing them. */
export async function seedDirectMessages(
	context: BrowserContext,
	conversationId: number,
	texts: string[]
) {
	const page = await context.newPage();
	await page.goto('/robots.txt');
	await page.evaluate(
		({ conversationId, texts }) =>
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
						socket.send(
							JSON.stringify({
								type: 'direct_message',
								id,
								conversation_id: conversationId,
								content: text,
								timestamp: new Date().toISOString()
							})
						);
					}
				};
			}),
		{ conversationId, texts }
	);
	await page.close();
}
