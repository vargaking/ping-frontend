<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Card from '$lib/components/ui/card/index';
	import * as Field from '$lib/components/ui/field/index';
	import Input from '$lib/components/ui/input/input.svelte';
	import { login } from '$lib/requests/auth/login';

	// username and password variables
	let username: string = '';
	let password: string = '';

	const loginUser = async () => {
		await login(username, password)
			.then((data) => {
				console.log('Login successful:', data);
				// Redirect to home page or perform other actions
				window.location.href = '/app';
			})
			.catch((error) => {
				console.error('Login failed:', error);
				// Handle login failure (e.g., show error message)
			});
	};
</script>

<div class="mx-auto flex h-screen w-screen items-center justify-center">
	<Card.Root class="w-full max-w-md">
		<Card.Header>
			<Card.Title>Login</Card.Title>
		</Card.Header>
		<Card.Content>
			<form class="space-y-6">
				<Field.Field>
					<Field.Label for="username">Username</Field.Label>
					<Input
						id="username"
						type="text"
						placeholder="Enter your username"
						bind:value={username}
					/>
				</Field.Field>
				<Field.Field>
					<Field.Label for="password">Password</Field.Label>
					<Input
						id="password"
						type="password"
						placeholder="Enter your password"
						bind:value={password}
					/>
				</Field.Field>
				<Button type="submit" class="w-full" onclick={loginUser}>Login</Button>
				<div class="mt-4 text-center text-sm text-gray-400">
					Don't have an account? <a href="/register" class="text-blue-500 hover:underline"
						>Register</a
					>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
