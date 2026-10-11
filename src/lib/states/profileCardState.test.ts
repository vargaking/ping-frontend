import { afterEach, describe, expect, it } from 'vitest';
import { profileCardState, type ProfileCardTarget } from './profileCardState.svelte';

const element = () => ({}) as HTMLElement;
const user = (userId: number): ProfileCardTarget => ({ kind: 'user', userId, serverId: 1 });

afterEach(() => profileCardState.close());

describe('profileCardState', () => {
	it('opens for the clicked element', () => {
		const anchor = element();
		profileCardState.toggle(anchor, user(1), { side: 'right' });
		expect(profileCardState.target).toEqual(user(1));
		expect(profileCardState.anchor).toBe(anchor);
		expect(profileCardState.placement).toEqual({ side: 'right' });
	});

	it('closes when the same element is clicked again', () => {
		const anchor = element();
		profileCardState.toggle(anchor, user(1));
		profileCardState.toggle(anchor, user(1));
		expect(profileCardState.target).toBeNull();
		expect(profileCardState.anchor).toBeNull();
	});

	it('switches to another element without closing in between', () => {
		const first = element();
		const second = element();
		profileCardState.toggle(first, user(1));
		profileCardState.toggle(second, user(2), { align: 'end' });
		expect(profileCardState.target).toEqual(user(2));
		expect(profileCardState.anchor).toBe(second);
		expect(profileCardState.placement).toEqual({ align: 'end' });
	});

	it('opens again after it was closed from outside', () => {
		const anchor = element();
		profileCardState.toggle(anchor, user(1));
		profileCardState.close();
		profileCardState.toggle(anchor, user(1));
		expect(profileCardState.target).toEqual(user(1));
	});
});
