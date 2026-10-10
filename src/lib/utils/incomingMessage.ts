export type IncomingContext = {
	/** Sent by this user (from another tab or device). */
	mine: boolean;
	/** The thread is on screen in front of the user. */
	active: boolean;
	/** …and its newest messages are in view. */
	reading: boolean;
	/** A forum post reply; forum views mark their channel read themselves. */
	inPost: boolean;
};

export function incomingMessageEffects({ mine, active, reading, inPost }: IncomingContext): {
	markRead: boolean;
	notify: boolean;
} {
	return { markRead: !mine && reading && !inPost, notify: !mine && !active };
}
