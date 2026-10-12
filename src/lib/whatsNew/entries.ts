import type { WhatsNewEntry } from '$lib/types/whatsNew.types';

/**
 * Newest first. Write plain words about what users notice, with no client/server split.
 * Add a server-side bullet only once that server change is deployed.
 * Never edit the id of a shipped entry.
 */
export const WHATS_NEW: WhatsNewEntry[] = [
	{
		id: '2026-10-12',
		date: '2026-10-12',
		title: 'Friends, and channels that open straight away',
		bullets: [
			'Add friends from a profile card, answer requests on the new Friends page, and see when friends are online even without a shared server.',
			'Channels, DMs and posts you have opened before show their messages at once, then catch up.',
			'Messages edited or deleted while your device was away are updated or removed when you come back.',
			'On a phone, tapping a voice channel shows who is in it first, with Join and Join muted.',
			'On a phone, the screen stays on during a voice call.'
		]
	},
	{
		id: '2026-10-11-2',
		date: '2026-10-11',
		title: 'Search filters, and smoother game streams',
		bullets: [
			'Narrow a search with from:name, has:image, has:video, has:file, has:link, before:, after: or during:, on their own or with words.',
			'Screen sharing set to "Motion and games" keeps the frame rate up, also for viewers watching in a small tile.'
		]
	},
	{
		id: '2026-10-11',
		date: '2026-10-11',
		title: 'Profile cards, and old messages in context',
		bullets: [
			'Click a name or avatar for a profile card with a banner, roles, when they joined and a Message button. Set your own banner in Settings → My account.',
			'Search results and reply quotes open at that message however far back it is. "Jump to latest" brings you back.',
			'Server import brings private channels along, lets you search for the member to match each author, and shows an upload running on another device.',
			'Pasted Markdown keeps its formatting, [text](url) becomes a link, and underline shows up in messages.',
			'Older messages load whenever you scroll to the top, and the @mention list and imported messages stay current without a reload.'
		]
	},
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
