<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import AuthField from '$lib/components/auth/AuthField.svelte';
	import { login } from '$lib/requests/auth/login';
	import { initializeAppData } from '$lib/utils/initializeAppData';
	import { getErrorMessage, normalizeError } from '$lib/requests/errors';
	import { safeNext } from '$lib/auth/session';

	let username = $state('');
	let password = $state('');
	let isSubmitting = $state(false);
	let formError = $state<string | null>(null);
	// A 401 means "wrong username or password" — highlight both fields, since we
	// can't tell which one is wrong.
	let credsInvalid = $state(false);

	// Clear the error state once the user starts fixing their input.
	function clearError() {
		if (formError || credsInvalid) {
			formError = null;
			credsInvalid = false;
		}
	}

	const registerHref = $derived.by(() => {
		const next = safeNext(page.url.searchParams.get('next'));
		return next ? `/register?next=${encodeURIComponent(next)}` : '/register';
	});

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (isSubmitting) return;

		if (!username || !password) {
			formError = 'Please enter your username and password.';
			return;
		}

		isSubmitting = true;
		formError = null;
		credsInvalid = false;

		try {
			await login(username, password);
			// Populate state + open the socket now, so goto() lands in a working app
			// without a full-page reload.
			await initializeAppData();
			const next = safeNext(page.url.searchParams.get('next'));
			await goto(next ?? '/app');
		} catch (error) {
			credsInvalid = normalizeError(error).status === 401;
			formError = getErrorMessage(error);
		} finally {
			isSubmitting = false;
		}
	}
</script>

<AuthShell>
	<div class="flex flex-col gap-2">
		<h1 class="text-[26px] leading-tight font-semibold">Sign in</h1>
		<p class="text-sm text-muted-foreground">Welcome back. Sign in to continue.</p>
	</div>

	<form class="flex flex-col gap-6" onsubmit={handleSubmit} novalidate>
		<div class="flex flex-col gap-4">
			<AuthField
				id="username"
				label="Username"
				autocomplete="username"
				bind:value={username}
				invalid={credsInvalid}
				disabled={isSubmitting}
				oninput={clearError}
			/>
			<AuthField
				id="password"
				label="Password"
				type="password"
				autocomplete="current-password"
				bind:value={password}
				invalid={credsInvalid}
				disabled={isSubmitting}
				oninput={clearError}
			/>

			{#if formError}
				<div role="alert" class="text-[13px] text-destructive">{formError}</div>
			{/if}
		</div>

		<button
			type="submit"
			disabled={isSubmitting}
			class="h-11 w-full rounded-[10px] bg-primary font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
		>
			{isSubmitting ? 'Signing in…' : 'Sign in'}
		</button>
	</form>

	<p class="text-center text-sm text-muted-foreground">
		New here? <a href={registerHref} class="font-medium text-foreground hover:underline"
			>Create an account</a
		>
	</p>
</AuthShell>
