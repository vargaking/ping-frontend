<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { serverRequestState } from '$lib/states/serverRequestState.svelte';
	import { fieldErrorsFrom, getErrorMessage } from '$lib/requests/errors';
	import { timeAgo } from '$lib/utils/timeAgo';
	import {
		DESCRIPTION_MAX,
		EXPECTED_SIZES,
		type ExpectedSize
	} from '$lib/types/serverRequest.types';
	import * as Dialog from '$lib/components/ui/dialog/index';
	import Button from '$lib/components/ui/button/button.svelte';
	import SettingsTextField from '$lib/components/settings/SettingsTextField.svelte';
	import { CircleCheck } from 'lucide-svelte';

	let {
		uid,
		onCancel,
		onViewSettings
	}: { uid: string; onCancel: () => void; onViewSettings: () => void } = $props();

	const request = $derived(serverRequestState.mine?.request ?? null);
	const declined = $derived(request?.status === 'declined' ? request : null);

	let name = $state('');
	let description = $state('');
	let size = $state<ExpectedSize>('lt10');
	let errors = $state<{ name?: string; description?: string }>({});
	let submitting = $state(false);
	let justSent = $state(false);
	let confirmingWithdraw = $state(false);
	let withdrawing = $state(false);

	const canSubmit = $derived(
		name.trim().length > 0 && description.trim().length > 0 && !submitting
	);

	async function submit() {
		if (!canSubmit) return;
		submitting = true;
		errors = {};
		try {
			await serverRequestState.submit({
				name: name.trim(),
				description: description.trim(),
				expected_size: size
			});
			name = '';
			description = '';
			justSent = true;
		} catch (e) {
			const fields = fieldErrorsFrom(e);
			errors = { name: fields.name, description: fields.description };
			toast.error(`Couldn't send the request: ${getErrorMessage(e)}`);
		} finally {
			submitting = false;
		}
	}

	async function withdraw() {
		withdrawing = true;
		try {
			await serverRequestState.withdraw();
		} catch (e) {
			toast.error(`Couldn't withdraw the request: ${getErrorMessage(e)}`);
		} finally {
			withdrawing = false;
			confirmingWithdraw = false;
		}
	}
</script>

{#snippet settingsLink(label: string)}
	<button
		type="button"
		onclick={onViewSettings}
		class="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
	>
		{label}
	</button>
{/snippet}

{#if justSent && request?.status === 'pending'}
	<div class="flex flex-col gap-5" role="status">
		<div class="flex flex-col items-center gap-3 rounded-xl border border-border p-6 text-center">
			<div class="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-online">
				<CircleCheck size={22} strokeWidth={1.75} aria-hidden="true" />
			</div>
			<div class="flex flex-col gap-1">
				<p class="text-[15px] font-semibold text-foreground">Request sent</p>
				<p class="text-[13px] text-text-subtle">
					We'll send you a notification when it's decided. You can check its status, or withdraw it,
					under Settings → Account → Server requests.
				</p>
			</div>
		</div>
		<Dialog.Footer>
			<Button variant="secondary" onclick={onCancel}>Close</Button>
			<Button onclick={onViewSettings}>View request status</Button>
		</Dialog.Footer>
	</div>
{:else if request?.status === 'pending'}
	<div class="flex flex-col gap-5">
		<div class="flex flex-col gap-1 rounded-xl border border-border p-4">
			<span class="text-[15px] font-semibold text-foreground">{request.name}</span>
			<span class="text-[13px] text-text-subtle">
				Pending review · sent {timeAgo(request.created_at)}
			</span>
			<p class="mt-2 text-[13px] break-words whitespace-pre-wrap text-muted-foreground">
				{request.description}
			</p>
		</div>
		<p class="text-xs text-text-subtle">
			We'll send you a notification once it's decided. {@render settingsLink(
				'See it in Settings → Account → Server requests'
			)}
		</p>
		<Dialog.Footer>
			{#if confirmingWithdraw}
				<Button variant="secondary" onclick={() => (confirmingWithdraw = false)}>Keep it</Button>
				<Button variant="destructive" disabled={withdrawing} onclick={withdraw}>
					{withdrawing ? 'Withdrawing…' : 'Withdraw request'}
				</Button>
			{:else}
				<Button variant="secondary" onclick={onCancel}>Close</Button>
				<Button variant="secondary" onclick={() => (confirmingWithdraw = true)}>Withdraw</Button>
			{/if}
		</Dialog.Footer>
	</div>
{:else}
	<form
		class="flex flex-col gap-5"
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
	>
		{#if declined}
			<div
				class="rounded-xl border border-destructive-border p-3 text-[13px] text-foreground"
				role="status"
			>
				<p class="font-medium">Your last request was declined</p>
				{#if declined.decline_reason}
					<p class="mt-1 break-words whitespace-pre-wrap text-muted-foreground">
						{declined.decline_reason}
					</p>
				{/if}
				<p class="mt-2 text-xs text-text-subtle">
					{@render settingsLink('See it in Server requests')}
				</p>
			</div>
		{/if}
		<p class="text-[13px] text-text-subtle">
			Servers are approved by hand while capacity is limited. You'll get a notification when your
			request is decided. Joining an existing server needs no approval.
		</p>

		<SettingsTextField
			id="{uid}-name"
			label="Server name"
			bind:value={name}
			error={errors.name}
			oninput={() => (errors.name = undefined)}
			maxlength={100}
		/>

		<SettingsTextField
			id="{uid}-description"
			label="What is it for?"
			bind:value={description}
			error={errors.description}
			hint="{description.length}/{DESCRIPTION_MAX}"
			oninput={() => (errors.description = undefined)}
			maxlength={DESCRIPTION_MAX}
			multiline
		/>

		<fieldset class="flex flex-col gap-1.5">
			<legend class="mb-1.5 text-[13px] font-medium text-text-label">Expected size</legend>
			<div class="flex gap-1 rounded-lg bg-surface-input p-1">
				{#each EXPECTED_SIZES as option (option.value)}
					<label
						class="flex flex-1 cursor-pointer items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium text-text-subtle transition-colors has-[:checked]:bg-accent has-[:checked]:text-foreground has-[:checked]:shadow-xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
					>
						<input
							type="radio"
							name="{uid}-size"
							value={option.value}
							bind:group={size}
							class="sr-only"
						/>
						{option.label}
					</label>
				{/each}
			</div>
		</fieldset>

		<Dialog.Footer>
			<Button variant="secondary" onclick={onCancel}>Cancel</Button>
			<Button type="submit" disabled={!canSubmit}>{submitting ? 'Sending…' : 'Send request'}</Button
			>
		</Dialog.Footer>
	</form>
{/if}
