import { redirect } from '@sveltejs/kit';

// DMs are the home view.
export const load = () => {
	redirect(307, '/app/direct/');
};
