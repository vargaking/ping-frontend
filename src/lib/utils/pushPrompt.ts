import { createDismissal } from './dismissal';

const dismissal = createDismissal('notifications:pushPrompt');

/** True when "Not now" was chosen recently, or was chosen enough times that the
 *  prompt should now live only in Settings. */
export const isPushPromptSnoozed = dismissal.isSnoozed;

export const dismissPushPrompt = dismissal.dismiss;
