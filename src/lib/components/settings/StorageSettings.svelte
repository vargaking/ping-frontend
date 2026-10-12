<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import Button from '$lib/components/ui/button/button.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { formatBytes } from '$lib/requests/attachments/uploadAttachment';
	import { historySyncState } from '$lib/states/historySyncState.svelte';
	import { installState } from '$lib/states/installState.svelte';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import { localHistoryAvailable, localHistoryReady } from '$lib/utils/db';
	import {
		isStoragePersisted,
		requestPersistence,
		storageUsage
	} from '$lib/utils/persistentStorage';
	import SettingsSwitch from './SettingsSwitch.svelte';

	let ready = $state<'checking' | 'ready' | 'blocked'>('checking');
	let usage = $state<number | null>(null);
	let persisted = $state<boolean | null>(null);
	let switching = $state(false);

	const unavailable = $derived(!localHistoryAvailable || ready === 'blocked');
	const downloadOn = $derived(historySyncState.downloadOn);

	async function refresh() {
		usage = await storageUsage();
		persisted = await isStoragePersisted();
		await historySyncState.refreshCount();
	}

	onMount(() => {
		if (!localHistoryAvailable) return;
		void localHistoryReady().then(async (ok) => {
			ready = ok ? 'ready' : 'blocked';
			if (ok) await refresh();
		});
	});

	async function toggle() {
		if (switching) return;
		switching = true;
		const on = !downloadOn;
		try {
			if (on) void requestPersistence().then(async () => (persisted = await isStoragePersisted()));
			await historySyncState.setDownload(on);
		} finally {
			switching = false;
		}
	}

	function askToClear() {
		const again = downloadOn;
		overlayState.open(ConfirmDialog, {
			title: again ? 'Clear and download again?' : 'Clear message history?',
			description: again
				? 'Everything stored on this device is deleted and downloaded again. Messages on the server stay as they are.'
				: 'Everything stored on this device is deleted. Messages on the server stay as they are, and conversations you open are stored again.',
			confirmLabel: again ? 'Clear and download again' : 'Clear',
			destructive: true,
			onConfirm: async () => {
				try {
					await historySyncState.clear();
				} catch (e) {
					console.warn('Failed to clear local history', e);
					toast.error("Couldn't clear the history on this device. Try again.");
				}
			}
		});
	}
</script>

<div class="flex max-w-md flex-col gap-6">
	{#if unavailable}
		<p class="text-sm text-muted-foreground">
			This browser doesn't keep message history on the device. Private windows and browsers that
			block site storage can't, and search needs it.
		</p>
	{:else if ready === 'ready'}
		<SettingsSwitch
			label="Download full history"
			description="Keep every conversation you can read on this device, so search covers all of it. When off, only conversations you open and new messages are kept."
			checked={downloadOn}
			pending={switching}
			disabled={switching}
			onclick={toggle}
		>
			{#if historySyncState.savingData}
				<span class="text-xs text-muted-foreground">
					Your browser asks to save data, so only the newest messages of each conversation are
					downloaded. Turn this on to download everything.
				</span>
			{/if}
		</SettingsSwitch>

		<dl class="flex flex-col gap-3 text-sm">
			<div class="flex flex-col gap-0.5">
				<dt class="font-medium">Storage used by Zeta on this device</dt>
				<dd class="text-muted-foreground">
					{usage === null ? 'Unknown' : formatBytes(usage)}
				</dd>
				<dd class="text-xs text-muted-foreground">
					Covers everything Zeta keeps in this browser, not only message history.
				</dd>
			</div>
			<div class="flex flex-col gap-0.5">
				<dt class="font-medium">Messages on this device</dt>
				<dd class="text-muted-foreground">{historySyncState.messages.toLocaleString()}</dd>
			</div>
			{#if persisted !== null}
				<div class="flex flex-col gap-0.5">
					<dt class="font-medium">Protection</dt>
					<dd class="text-muted-foreground">
						{persisted
							? 'Protected. The browser keeps this data until you clear it.'
							: 'Not protected. The browser may delete this data when it needs space.'}
					</dd>
					{#if !persisted && installState.needsHomeScreenInstall}
						<dd class="text-xs text-muted-foreground">
							Tap Share, then Add to Home Screen, to keep it.
						</dd>
					{/if}
				</div>
			{/if}
		</dl>

		<div>
			<Button variant="destructive" size="sm" onclick={askToClear}>
				{downloadOn ? 'Clear and download again' : 'Clear'}
			</Button>
		</div>
	{/if}
</div>
