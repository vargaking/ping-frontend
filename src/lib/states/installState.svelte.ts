import { createDismissal } from '$lib/utils/dismissal';
import { installHint, readInstallEnv } from '$lib/utils/install';

const dismissal = createDismissal('notifications:installPrompt');

type InstallPromptEvent = Event & {
	prompt(): Promise<void>;
};

/** Whether to nudge a phone user to install the app, and the browser's own
 *  install prompt on Android. The prompt event can fire before the app shell
 *  mounts, so listening starts from the root layout. */
class InstallState {
	private env = readInstallEnv();
	private promptEvent = $state<InstallPromptEvent | null>(null);
	private installed = $state(false);
	private snoozed = $state(dismissal.isSnoozed());
	private attached = false;

	readonly platform = this.env.platform;

	/** On an iPhone or iPad, notifications only exist in the installed app. */
	readonly needsHomeScreenInstall =
		this.env.platform === 'ios' && !this.env.standalone && !this.env.desktopShell;

	readonly hint = $derived(installHint(this.env, this.promptEvent !== null));
	readonly visible = $derived(this.hint !== null && !this.installed && !this.snoozed);

	attach() {
		if (this.attached || typeof window === 'undefined') return;
		this.attached = true;

		window.addEventListener('beforeinstallprompt', (event) => {
			event.preventDefault();
			this.promptEvent = event as InstallPromptEvent;
		});
		window.addEventListener('appinstalled', () => {
			this.installed = true;
			this.promptEvent = null;
		});
	}

	async install() {
		const event = this.promptEvent;
		if (!event) return;
		// An install prompt event can only be used once.
		this.promptEvent = null;
		try {
			await event.prompt();
		} catch (e) {
			console.warn('Install prompt failed', e);
		}
	}

	dismiss() {
		dismissal.dismiss();
		this.snoozed = true;
	}
}

export const installState = new InstallState();
