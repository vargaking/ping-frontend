/** Reactive "the document is visible and focused" signal, shared by every
 *  MessageList instance that needs to know whether its thread is being read. */
class DocumentFocusState {
	visible = $state(typeof document !== 'undefined' ? document.visibilityState === 'visible' : true);
	focused = $state(typeof document !== 'undefined' ? document.hasFocus() : true);

	private attached = false;

	attach() {
		if (this.attached || typeof document === 'undefined') return;
		this.attached = true;

		const update = () => {
			this.visible = document.visibilityState === 'visible';
			this.focused = document.hasFocus();
		};

		document.addEventListener('visibilitychange', update);
		window.addEventListener('focus', update);
		window.addEventListener('blur', update);
	}
}

export const documentFocusState = new DocumentFocusState();
