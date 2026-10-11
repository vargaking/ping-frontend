import { describe, expect, it } from 'vitest';
import type { MessageType } from '$lib/types/messages.types';
import { replyState } from './replyState.svelte';

const message = (id: string) => ({ id }) as MessageType;

describe('replyState.reset', () => {
	it('drops the reply drafted in every thread', () => {
		replyState.start('channel:1', message('a'));
		replyState.start('dm:2', message('b'));

		replyState.reset();

		expect(replyState.target['channel:1']).toBeUndefined();
		expect(replyState.target['dm:2']).toBeUndefined();
	});
});
