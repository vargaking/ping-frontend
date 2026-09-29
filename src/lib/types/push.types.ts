export type PushConfig = {
	enabled: boolean;
	public_key: string | null;
};

export type PushSubscriptionBody = {
	endpoint: string;
	keys: { p256dh: string; auth: string };
};
