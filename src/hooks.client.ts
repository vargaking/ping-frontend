import type { HandleClientError, ClientInit } from '@sveltejs/kit';
import { installErrorReporting, reportClientError } from '$lib/utils/errorReporting';

export const init: ClientInit = () => {
	installErrorReporting();
};

export const handleError: HandleClientError = ({ error, status }) => {
	if (status === 404) return { message: 'Not found' };
	const { message, stack } =
		error instanceof Error ? error : { message: String(error), stack: undefined };
	reportClientError({ kind: 'svelte', message, stack });
	return { message: 'Something went wrong' };
};
