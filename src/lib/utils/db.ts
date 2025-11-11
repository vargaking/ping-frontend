import type { User } from '$lib/types/auth.types';
import type { Channel } from '$lib/types/channel.types';
import type { MessageType } from '$lib/types/messages.types';
import type { Server } from '$lib/types/server.types';
import Dexie, { type EntityTable } from 'dexie';

const db = new Dexie('PingDatabase') as Dexie & {
	servers: EntityTable<Server>;
	channels: EntityTable<Channel>;
	messages: EntityTable<MessageType>;
	users: EntityTable<User>;
};

db.version(1).stores({
	servers: '++id, name, server_profile, server_settings',
	channels: '++id, server_id, name, channel_settings',
	messages: 'id, server_id, channel_id, user_id, content, timestamp',
	users: '++id, username, public_key, profile'
});

export { db };
