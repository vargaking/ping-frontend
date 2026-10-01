export const dmTag = (conversationId: number) => `dm-${conversationId}`;
export const channelTag = (channelId: number) => `ch-${channelId}`;

export type NotificationData = { url: string; count: number; messageUuid?: string };
