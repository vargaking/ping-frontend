<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import AuthField from '$lib/components/auth/AuthField.svelte';
	import { register } from '$lib/requests/auth/register';
	import { initializeAppData } from '$lib/utils/initializeAppData';
	import { getErrorMessage, fieldErrorsFrom, normalizeError } from '$lib/requests/errors';
	import { safeNext } from '$lib/auth/session';

	// Mirror the backend rules (see RegisterRequest) so validation is live and the
	// server rarely has to reject anything.
	const USERNAME_RE = /^[A-Za-z0-9._-]+$/;

	let username = $state('');
	let password = $state('');
	let confirm = $state('');
	let isSubmitting = $state(false);

	let formError = $state<string | null>(null);
	let serverUsernameError = $state<string | null>(null);
	let serverPasswordError = $state<string | null>(null);

	let touched = $state({ username: false, password: false, confirm: false });
	let submitAttempted = $state(false);

	const usernameRule = $derived.by(() => {
		if (!username) return 'Username is required.';
		if (username.length < 3) return 'Username must be at least 3 characters.';
		if (username.length > 32) return 'Username must be 32 characters or fewer.';
		if (!USERNAME_RE.test(username)) return 'Use only letters, numbers, and . _ -';
		return null;
	});
	const passwordRule = $derived.by(() => {
		if (!password) return 'Password is required.';
		if (password.length < 8) return 'Password must be at least 8 characters.';
		return null;
	});
	const confirmRule = $derived.by(() => {
		if (!confirm) return 'Please confirm your password.';
		if (confirm !== password) return "Passwords don't match.";
		return null;
	});

	const isValid = $derived(!usernameRule && !passwordRule && !confirmRule);

	// Show a client rule only once the field has been visited (or on submit); a
	// server error, when present, takes precedence.
	const usernameError = $derived(
		serverUsernameError ?? (touched.username || submitAttempted ? usernameRule : null)
	);
	const passwordError = $derived(
		serverPasswordError ?? (touched.password || submitAttempted ? passwordRule : null)
	);
	const confirmError = $derived(touched.confirm || submitAttempted ? confirmRule : null);

	// A server error is stale the moment the user edits that field.
	function onUsernameInput() {
		serverUsernameError = null;
		formError = null;
	}
	function onPasswordInput() {
		serverPasswordError = null;
		formError = null;
	}
	function onConfirmInput() {
		formError = null;
	}

	const loginHref = $derived.by(() => {
		const next = safeNext(page.url.searchParams.get('next'));
		return next ? `/login?next=${encodeURIComponent(next)}` : '/login';
	});

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (isSubmitting) return;

		submitAttempted = true;
		if (!isValid) return;

		isSubmitting = true;
		formError = null;

		try {
			// The register endpoint sets the session cookie, so we're logged in on
			// success — populate state and go straight into the app.
			await register(username, password);
			await initializeAppData();
			const next = safeNext(page.url.searchParams.get('next'));
			await goto(next ?? '/app');
		} catch (error) {
			const status = normalizeError(error).status;
			const fields = fieldErrorsFrom(error);

			if (status === 409) {
				serverUsernameError = 'That username is already taken.';
			} else if (fields.username || fields.password) {
				if (fields.username) serverUsernameError = usernameRule ?? fields.username;
				if (fields.password) serverPasswordError = passwordRule ?? fields.password;
			} else {
				formError = getErrorMessage(error);
			}
		} finally {
			isSubmitting = false;
		}
	}
</script>

<AuthShell>
	<div class="flex flex-col gap-2">
		<h1 class="text-[26px] leading-tight font-semibold">Create an account</h1>
		<p class="text-sm text-muted-foreground">Pick a username and a password to get started.</p>
	</div>

	<form class="flex flex-col gap-6" onsubmit={handleSubmit} novalidate>
		<div class="flex flex-col gap-4">
			<AuthField
				id="username"
				label="Username"
				autocomplete="username"
				bind:value={username}
				error={usernameError}
				disabled={isSubmitting}
				onblur={() => (touched.username = true)}
				oninput={onUsernameInput}
			/>
			<AuthField
				id="password"
				label="Password"
				type="password"
				autocomplete="new-password"
				bind:value={password}
				error={passwordError}
				hint="At least 8 characters."
				disabled={isSubmitting}
				onblur={() => (touched.password = true)}
				oninput={onPasswordInput}
			/>
			<AuthField
				id="confirm"
				label="Confirm password"
				type="password"
				autocomplete="new-password"
				bind:value={confirm}
				error={confirmError}
				disabled={isSubmitting}
				onblur={() => (touched.confirm = true)}
				oninput={onConfirmInput}
			/>

			{#if formError}
				<div role="alert" class="text-[13px] text-destructive">{formError}</div>
			{/if}
		</div>

		<button
			type="submit"
			disabled={isSubmitting || !isValid}
			class="h-11 w-full rounded-[10px] bg-primary font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
		>
			{isSubmitting ? 'Creating account…' : 'Create account'}
		</button>
	</form>

	<p class="text-center text-sm text-muted-foreground">
		Already have an account? <a href={loginHref} class="font-medium text-foreground hover:underline"
			>Sign in</a
		>
	</p>
</AuthShell>
