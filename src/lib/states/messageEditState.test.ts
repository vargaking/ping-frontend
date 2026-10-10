import { expect, it } from 'vitest';
import { messageEditState } from './messageEditState.svelte';

it('stop leaves no message being edited', () => {
	messageEditState.start('m1');

	messageEditState.stop();

	expect(messageEditState.editingId).toBeNull();
	expect(messageEditState.isEditing('m1')).toBe(false);
});
