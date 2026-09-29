<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { serversState } from '$lib/states/serversState.svelte';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import { deleteServer } from '$lib/requests/servers/deleteServer';
	import { getErrorMessage } from '$lib/requests/errors';
	import { serverRemoved } from '$lib/utils/serverRemoved';
	import * as Dialog from '$lib/components/ui/dialog/index';
	import Button from '$lib/components/ui/button/button.svelte';
	import SettingsTextField from './SettingsTextField.svelte';

	const server = $derived(serversState.selectedServer);

	let open = $state(false);
	let deleting = $state(false);
	let typed = $state('');

	const matches = $derived(server != null && typed.trim() === server.name);

	const destructiveOutline =
		'border border-destructive-border bg-transparent text-destructive hover:bg-destructive/10';

	function onOpenChange(next: boolean) {
		if (deleting) return;
		open = next;
		if (!next) typed = '';
	}

	async function confirm(e: SubmitEvent) {
		e.preventDefault();
		const id = server?.id;
		if (server == null || id == null || !matches || deleting) return;
		const { name } = server;
		deleting = true;
		try {
			await deleteServer(id);
		} catch (err) {
			toast.error(`Couldn't delete the server: ${getErrorMessage(err)}`);
			deleting = false;
			return;
		}
		overlayState.close();
		await serverRemoved(id);
		toast.success(`Deleted ${name}`);
	}
</script>

{#if server}
	<section
		aria-label="Danger zone"
		class="flex max-w-xl flex-col gap-3 rounded-xl border border-destructive-border p-4"
	>
		<h3 class="text-sm font-semibold text-destructive">Danger zone</h3>
		<div class="flex items-center gap-4">
			<p class="flex-1 text-[13px] text-muted-foreground">
				Deleting this server removes it, its channels and its messages for everyone.
			</p>
			<Dialog.Root {open} {onOpenChange}>
				<Dialog.Trigger>
					{#snippet child({ props })}
						<Button {...props} class={destructiveOutline}>Delete server</Button>
					{/snippet}
				</Dialog.Trigger>
				<Dialog.Content>
					<form class="contents" onsubmit={confirm} novalidate>
						<Dialog.Header>
							<Dialog.Title>Delete {server.name}?</Dialog.Title>
							<Dialog.Description>
								This permanently deletes the server, its channels and messages for everyone. This
								can't be undone.
							</Dialog.Description>
						</Dialog.Header>
						<SettingsTextField
							id="delete-server-confirm"
							label="Type the server name to confirm"
							bind:value={typed}
							placeholder={server.name}
						/>
						<Dialog.Footer>
							<Button variant="secondary" disabled={deleting} onclick={() => onOpenChange(false)}>
								Cancel
							</Button>
							<Button type="submit" class={destructiveOutline} disabled={!matches || deleting}>
								{deleting ? 'Deleting…' : 'Delete server'}
							</Button>
						</Dialog.Footer>
					</form>
				</Dialog.Content>
			</Dialog.Root>
		</div>
	</section>
{/if}
