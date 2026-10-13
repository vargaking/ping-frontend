/** The address a game server should call: the configured API, or this site when it is same-origin. */
export function gameApiUrl(configuredBase: string, origin: string): string {
	return (configuredBase || origin).replace(/\/+$/, '');
}

/** What the server owner pastes into the plugin's config.yml. */
export function pluginConfig(apiUrl: string, key: string): string {
	return `api-url: ${apiUrl}\napi-key: ${key}`;
}
