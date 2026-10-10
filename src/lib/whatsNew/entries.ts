import type { WhatsNewEntry } from '$lib/types/whatsNew.types';

/**
 * Newest first. Write plain words about what users notice, with no client/server split.
 * Add a server-side bullet only once that server change is deployed.
 * Never edit the id of a shipped entry.
 */
export const WHATS_NEW: WhatsNewEntry[] = [
	{
		id: '2026-10-10-2',
		date: '2026-10-10',
		title: 'Catching up is quicker',
		bullets: [
			'A "Jump to latest" button, or Esc, takes you back to the newest messages.',
			'On a phone, swipe a message to the left to reply to it.',
			'New servers start with a general text channel and a General voice channel.',
			'Screen sharing in the Linux desktop app shows one picker and tells you if sharing fails.'
		]
	},
	{
		id: '2026-10-10',
		date: '2026-10-10',
		title: 'Search, code blocks and private channels',
		bullets: [
			'Search your messages and forum posts from the bar at the top.',
			'Code blocks show their language and have a copy button. Type ``` to start one.',
			'Make channels and categories private, and choose what each role can do in them.',
			'You can attach files up to 25 MB.',
			'When a new version is out, a notice lets you reload when it suits you.'
		]
	},
	{
		id: '2026-10-06',
		date: '2026-10-06',
		title: 'Better on phones',
		bullets: [
			'Add the app to your home screen to get notifications and an unread badge.',
			'Swipe to move between the channel list and the conversation.',
			'Settings, dialogs and calls now fit small screens.',
			'Moving from Discord? Import your server from its export in the server settings.'
		]
	},
	{
		id: '2026-10-05',
		date: '2026-10-05',
		title: 'Roles, forums and categories',
		bullets: [
			'Create roles with their own colour and permissions, and give a member several roles.',
			'Forum channels: posts with a title and tags, each with its own replies.',
			'Group channels into categories you can collapse.',
			'In a call, set each person’s volume or mute them just for you. Moderators can mute or remove people.'
		]
	},
	{
		id: '2026-10-03',
		date: '2026-10-03',
		title: 'A desktop app, and right-click menus',
		bullets: [
			'Download the desktop app for Windows or Linux from the home page. It sits in the tray and can start when you sign in.',
			'Right-click a message, channel, server or member for quick actions.',
			'Messages you send while offline wait and go out once you are back. If one fails, you can retry it.',
			'Links show a preview, and you can see who is typing.'
		]
	},
	{
		id: '2026-10-01',
		date: '2026-10-01',
		title: 'Reactions, replies and notifications',
		bullets: [
			'React to any message with an emoji.',
			'Reply to a message to quote it in your answer.',
			'Turn on notifications to hear about direct messages and mentions while you are away.',
			'Click an image to see it full size.'
		]
	}
];
