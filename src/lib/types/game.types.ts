export type GameSessionPlayer = {
	user_id: number;
	player_name: string;
};

/** Body of a game_session frame, and of GET /api/game/sessions/{channel_id}. */
export type GameSession = {
	server_id: number;
	channel_id: number;
	integration_id: number;
	name: string;
	active: boolean;
	players_hear_spectators: boolean;
	players: GameSessionPlayer[];
};

/** My own gains in a game_mix frame, keyed by user id. */
export type GameMix = {
	channel_id: number;
	integration_id: number;
	gains: Record<string, number>;
};

export type GameIntegration = {
	id: number;
	server_id: number;
	name: string;
	voice_channel_id: number | null;
	players_hear_spectators: boolean;
	key_prefix: string;
	created_at: string;
	linked_count: number;
	active: boolean;
};

export type GameIntegrationCreate = {
	name: string;
	voice_channel_id: number;
	players_hear_spectators?: boolean;
};

export type GameIntegrationUpdate = Partial<GameIntegrationCreate>;

export type GameKey = {
	key: string;
	key_prefix: string;
};

export type GameLink = {
	user_id: number;
	username: string;
	player_id: string;
	player_name: string;
	created_at: string;
};

export type GameLinkPreview = {
	integration_id: number;
	integration_name: string;
	server_id: number;
	server_name: string;
	player_name: string;
	linked_player_name: string | null;
};

/** Who is playing what, as shown next to a voice participant. */
export type PlayingAs = {
	name: string;
	playerName: string;
};
