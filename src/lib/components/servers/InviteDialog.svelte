<script lang="ts" module>
	const EXPIRY_OPTIONS = [
		{ value: '30', label: '30 minutes' },
		{ value: '60', label: '1 hour' },
		{ value: '360', label: '6 hours' },
		{ value: '720', label: '12 hours' },
		{ value: '1440', label: '1 day' },
		{ value: '10080', label: '7 days' },
		{ value: 'never', label: 'Never' }
	];
	const MAX_USES_OPTIONS = [
		{ value: 'unlimited', label: 'No limit' },
		...[1, 5, 10, 25, 50, 100].map((n) => ({ value: String(n), label: String(n) }))
	];
	const DEFAULT_EXPIRY = '10080';
	const DEFAULT_MAX_USES = 'unlimited';
	const COPIED_MS = 2000;
	const fieldClass =
		'h-10 w-full rounded-[10px] border border-input bg-surface-input px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50';
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { serversState } from '$lib/states/serversState.svelte';
	import { createInvite, deleteInvite, updateInvite } from '$lib/requests/invites';
	import { getErrorMessage } from '$lib/requests/errors';
	import type { InviteResponse } from '$lib/types/invite.types';
	import * as Dialog from '$lib/components/ui/dialog/index';
	import Button from '$lib/components/ui/button/button.svelte';
	import ErrorState from '$lib/components/ui/feedback/ErrorState.svelte';
	import { Check, ChevronDown, Copy } from 'lucide-svelte';

	let { open = $bindable(false), onclose }: { open?: boolean; onclose?: () => void } = $props();

	const uid = $props.id();
	const serverId = $derived(serversState.selectedServer?.id);

	let invite = $state<InviteResponse | null>(null);
	let failed = $state(false);
	let busy = $state(false);
	let expiry = $state(DEFAULT_EXPIRY);
	let maxUses = $state(DEFAULT_MAX_USES);
	let password = $state('');
	let advancedOpen = $state(false);
	let appliedExpiry = DEFAULT_EXPIRY;
	let appliedMaxUses = DEFAULT_MAX_USES;
	let copied = $state(false);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;
	// Bumped on every open/close so a slow request can't write into a later session.
	let session = 0;

	const link = $derived(invite ? `${window.location.origin}/invite/${invite.id}/` : '');
	const hasPassword = $derived(invite?.has_password ?? false);
	const canApplyPassword = $derived(
		!busy && invite != null && (password.length > 0 || hasPassword)
	);

	function validUntil(): string | null {
		if (expiry === 'never') return null;
		return new Date(Date.now() + Number(expiry) * 60_000).toISOString();
	}

	function limit(): number | null {
		return maxUses === 'unlimited' ? null : Number(maxUses);
	}

	function reset() {
		session++;
		invite = null;
		failed = false;
		busy = false;
		expiry = appliedExpiry = DEFAULT_EXPIRY;
		maxUses = appliedMaxUses = DEFAULT_MAX_USES;
		password = '';
		advancedOpen = false;
		copied = false;
	}

	$effect(() => {
		if (!open) {
			untrack(reset);
			return;
		}
		untrack(() => {
			reset();
			void issue();
		});
	});

	$effect(() => () => clearTimeout(copiedTimer));

	/** Creates an invite with the current options, replacing `previous` when given. */
	async function issue(previous?: InviteResponse) {
		if (serverId == null) return;
		const mine = session;
		busy = true;
		failed = false;
		try {
			if (previous) await deleteInvite(previous.id);
		} catch (e) {
			if (mine !== session) return;
			busy = false;
			toast.error(`Couldn't update the invite: ${getErrorMessage(e)}`);
			return;
		}
		try {
			const created = await createInvite({
				server_id: serverId,
				valid_until: validUntil(),
				max_uses: limit(),
				password: password || null
			});
			if (mine !== session) return;
			invite = created;
			appliedExpiry = expiry;
			appliedMaxUses = maxUses;
			password = '';
		} catch (e) {
			if (mine !== session) return;
			invite = null;
			failed = true;
			toast.error(`Couldn't create the invite: ${getErrorMessage(e)}`);
		} finally {
			if (mine === session) busy = false;
		}
	}

	async function applyOptions() {
		const current = invite;
		if (!current || busy) return;
		const mine = session;
		busy = true;
		try {
			const updated = await updateInvite(current.id, {
				valid_until: validUntil(),
				max_uses: limit()
			});
			if (mine !== session) return;
			invite = updated;
			appliedExpiry = expiry;
			appliedMaxUses = maxUses;
		} catch (e) {
			if (mine !== session) return;
			expiry = appliedExpiry;
			maxUses = appliedMaxUses;
			toast.error(`Couldn't update the invite: ${getErrorMessage(e)}`);
		} finally {
			if (mine === session) busy = false;
		}
	}

	async function applyPassword() {
		if (invite && canApplyPassword) await issue(invite);
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(link);
		} catch {
			toast.error("Couldn't copy the link. Select it and copy manually.");
			return;
		}
		copied = true;
		clearTimeout(copiedTimer);
		copiedTimer = setTimeout(() => (copied = false), COPIED_MS);
	}

	function handleOpenChange(next: boolean) {
		open = next;
		if (!next) onclose?.();
	}
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Invite people</Dialog.Title>
			<Dialog.Description>Anyone with this link can join the server.</Dialog.Description>
		</Dialog.Header>

		{#if failed}
			<ErrorState
				title="Couldn’t create an invite"
				description="There was a problem reaching the server."
				onRetry={() => issue()}
			/>
		{:else}
			<div class="flex flex-col gap-5">
				<div class="flex flex-col gap-1.5">
					<label for="{uid}-link" class="text-[13px] font-medium text-text-label">
						Invite link
					</label>
					<div class="flex items-center gap-2" aria-busy={busy}>
						{#if busy}
							<div class="h-10 flex-1 animate-pulse rounded-[10px] bg-accent"></div>
						{:else}
							<input
								id="{uid}-link"
								type="text"
								readonly
								value={link}
								onfocus={(e) => e.currentTarget.select()}
								class="{fieldClass} min-w-0 flex-1 font-mono text-[13px]"
							/>
						{/if}
						<Button
							class="h-10 rounded-[10px] bg-primary/15 text-primary shadow-none hover:bg-primary/25"
							disabled={busy || !invite}
							onclick={copy}
						>
							{#if copied}
								<Check size={16} strokeWidth={1.75} />
								Copied
							{:else}
								<Copy size={16} strokeWidth={1.75} />
								Copy
							{/if}
						</Button>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="flex flex-col gap-1.5">
						<label for="{uid}-expiry" class="text-[13px] font-medium text-text-label">
							Expires
						</label>
						<select
							id="{uid}-expiry"
							class={fieldClass}
							bind:value={expiry}
							disabled={busy || !invite}
							onchange={applyOptions}
						>
							{#each EXPIRY_OPTIONS as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</div>
					<div class="flex flex-col gap-1.5">
						<label for="{uid}-max-uses" class="text-[13px] font-medium text-text-label">
							Max uses
						</label>
						<select
							id="{uid}-max-uses"
							class={fieldClass}
							bind:value={maxUses}
							disabled={busy || !invite}
							onchange={applyOptions}
						>
							{#each MAX_USES_OPTIONS as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</div>
				</div>

				<div class="flex flex-col gap-3">
					<button
						type="button"
						aria-expanded={advancedOpen}
						aria-controls="{uid}-advanced"
						onclick={() => (advancedOpen = !advancedOpen)}
						class="flex w-fit items-center gap-1.5 rounded-md text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						<ChevronDown
							size={16}
							strokeWidth={1.75}
							class="transition-transform {advancedOpen ? '' : '-rotate-90'}"
						/>
						Advanced
					</button>
					{#if advancedOpen}
						<form
							id="{uid}-advanced"
							class="flex flex-col gap-1.5"
							onsubmit={(e) => {
								e.preventDefault();
								applyPassword();
							}}
						>
							<label for="{uid}-password" class="text-[13px] font-medium text-text-label">
								Password
							</label>
							<div class="flex items-center gap-2">
								<input
									id="{uid}-password"
									type="password"
									autocomplete="off"
									bind:value={password}
									placeholder={hasPassword ? 'Password set' : 'Optional'}
									aria-describedby="{uid}-password-hint"
									class="{fieldClass} min-w-0 flex-1 placeholder:text-text-subtle"
								/>
								<Button
									type="submit"
									variant="secondary"
									class="h-10 rounded-[10px] border border-input"
									disabled={!canApplyPassword}
								>
									Apply
								</Button>
							</div>
							<p id="{uid}-password-hint" class="text-xs text-text-subtle">
								Applying creates a new link and revokes the current one.
								{#if hasPassword}Leave it empty to remove the password.{/if}
							</p>
						</form>
					{/if}
				</div>
			</div>
		{/if}

		<Dialog.Footer>
			<Button variant="secondary" onclick={() => handleOpenChange(false)}>Done</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
