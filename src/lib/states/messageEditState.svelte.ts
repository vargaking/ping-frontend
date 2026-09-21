/** Which message is currently being edited in place, if any. Only one message
 *  is editable at a time — starting an edit replaces any previous one. */
class MessageEditState {
	editingId: string | null = $state(null);

	start(id: string) {
		this.editingId = id;
	}

	stop() {
		this.editingId = null;
	}

	isEditing(id: string): boolean {
		return this.editingId === id;
	}
}

export const messageEditState = new MessageEditState();
