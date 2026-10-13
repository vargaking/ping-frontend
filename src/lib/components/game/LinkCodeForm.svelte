<script lang="ts">
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/button/button.svelte';
	import SettingsTextField from '$lib/components/settings/SettingsTextField.svelte';

	let code = $state('');

	const trimmed = $derived(code.trim());

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (trimmed) void goto(`/app/link-game/?code=${encodeURIComponent(trimmed)}`);
	}
</script>

<form class="flex flex-col gap-4" onsubmit={submit}>
	<SettingsTextField
		id="link-code"
		label="Link code"
		bind:value={code}
		normalize={(typed) => typed.toUpperCase()}
		maxlength={16}
		placeholder="K7QMX2PD"
		hint="Run /zeta link in the game to get one."
	/>
	<Button type="submit" class="w-fit" disabled={!trimmed}>Continue</Button>
</form>
