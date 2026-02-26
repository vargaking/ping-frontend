<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Card from '$lib/components/ui/card/index';
	import * as Field from '$lib/components/ui/field/index';
	import Input from '$lib/components/ui/input/input.svelte';
	import { register } from '$lib/requests/auth/register';

	let username: string = '';
	let password: string = '';
	let errorMsg: string | null = null;
	let isRegistering = false;

	const registerUser = async (e: Event) => {
		e.preventDefault();
		if (!username || !password) {
			errorMsg = 'Please enter username and password';
			return;
		}

		isRegistering = true;
		errorMsg = null;

		try {
			const data = await register(username, password);
			console.log('Registration successful:', data);
			// After registering, simply redirect to login
			window.location.href = '/login';
		} catch (error: any) {
			console.error('Registration failed:', error);
			errorMsg = error?.response?.data?.detail || 'Registration failed';
		} finally {
			isRegistering = false;
		}
	};
</script>

<div class="mx-auto flex h-screen w-screen items-center justify-center">
	<Card.Root class="w-full max-w-md">
		<Card.Header>
			<Card.Title>Create an Account</Card.Title>
		</Card.Header>
		<Card.Content>
			<form class="space-y-6" onsubmit={registerUser}>
				<Field.Field>
					<Field.Label for="username">Username</Field.Label>
					<Input id="username" type="text" placeholder="Choose a username" bind:value={username} />
				</Field.Field>
				<Field.Field>
					<Field.Label for="password">Password</Field.Label>
					<Input
						id="password"
						type="password"
						placeholder="Choose a password"
						bind:value={password}
					/>
				</Field.Field>

				{#if errorMsg}
					<div class="text-sm font-medium text-red-500">
						{errorMsg}
					</div>
				{/if}

				<Button type="submit" class="w-full" disabled={isRegistering}>
					{isRegistering ? 'Registering...' : 'Register'}
				</Button>

				<div class="mt-4 text-center text-sm text-gray-400">
					Already have an account? <a href="/login" class="text-blue-500 hover:underline">Login</a>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
