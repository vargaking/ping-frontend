export type AnnouncementLevel = 'info' | 'maintenance' | 'incident';

export const ANNOUNCEMENT_LEVELS: { value: AnnouncementLevel; label: string }[] = [
	{ value: 'info', label: 'Info' },
	{ value: 'maintenance', label: 'Maintenance' },
	{ value: 'incident', label: 'Incident' }
];

export const ANNOUNCEMENT_TEXT_MAX = 500;

export type Announcement = {
	id: number;
	text: string;
	level: AnnouncementLevel;
	created_at: string;
	expires_at: string | null;
	ended: boolean;
	dismissed: boolean;
};

export type AdminAnnouncement = Omit<Announcement, 'dismissed'> & {
	created_by: { id: number; username: string } | null;
};

export type AnnouncementInput = {
	text: string;
	level: AnnouncementLevel;
	expires_at?: string;
};
