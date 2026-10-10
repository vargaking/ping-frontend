export type WhatsNewEntry = {
	id: string;
	/** First 10 characters of the id. */
	date: string;
	title: string;
	/** One to five short lines. */
	bullets: string[];
	image?: { src: `/whats-new/${string}`; alt: string };
};

export type WhatsNewSeen = {
	last_seen_id: string | null;
	created_on: string;
};
