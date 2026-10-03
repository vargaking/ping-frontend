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

	let { uid, onCancel }: { uid: string; onCancel: () => void } = $props();

	const request = $derived(serverRequestState.mine?.request ?? null);
	const declined = $derived(request?.status === 'declined' ? request : null);

	let name = $state('');
	let description = $state('');
	let size = $state<ExpectedSize>('lt10');
	let errors = $state<{ name?: string; description?: string }>({});
	let submitting = $state(false);
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

{#if request?.status === 'pending'}
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
			We'll tell you here, and by notification if you're away, once it's decided.
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
			</div>
		{:else}
			<p class="text-[13px] text-text-subtle">
				New servers are approved by hand for now. Tell us what you have in mind.
			</p>
		{/if}

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
