<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import {
		createAnnouncement,
		endAnnouncement,
		listAdminAnnouncements
	} from '$lib/requests/admin/announcements';
	import { getErrorMessage } from '$lib/requests/errors';
	import {
		ANNOUNCEMENT_LEVELS,
		ANNOUNCEMENT_TEXT_MAX,
		type AdminAnnouncement,
		type AnnouncementLevel
	} from '$lib/types/announcement.types';
	import { timeAgo } from '$lib/utils/timeAgo';
	import Button from '$lib/components/ui/button/button.svelte';
	import SettingsTextField from '$lib/components/settings/SettingsTextField.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/feedback/ErrorState.svelte';
	import LoadingList from '$lib/components/ui/feedback/LoadingList.svelte';

	let announcements = $state<AdminAnnouncement[]>([]);
	let loading = $state(true);
	let loadFailed = $state(false);
	let endingId = $state<number | null>(null);

	let text = $state('');
	let level = $state<AnnouncementLevel>('info');
	let expiry = $state('');
	let sending = $state(false);
	let textError = $state('');
	let expiryError = $state('');

	async function load() {
		loading = true;
		loadFailed = false;
		try {
			announcements = await listAdminAnnouncements();
		} catch (e) {
			console.warn('Failed to load announcements', e);
			loadFailed = true;
		} finally {
			loading = false;
		}
	}

	onMount(() => void load());

	function validate(): string | null | false {
		textError = text.trim() ? '' : 'Write the announcement text.';
		expiryError = '';
		let expiresAt: string | null = null;
		if (expiry) {
			// A datetime-local value has no zone; the Date constructor reads it as local time.
			const date = new Date(expiry);
			if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
				expiryError = 'Pick a time in the future.';
			} else {
				expiresAt = date.toISOString();
			}
		}
		return textError || expiryError ? false : expiresAt;
	}

	async function send(event: SubmitEvent) {
		event.preventDefault();
		const expiresAt = validate();
		if (expiresAt === false) return;
		sending = true;
		try {
			const created = await createAnnouncement({
				text: text.trim(),
				level,
				...(expiresAt && { expires_at: expiresAt })
			});
			announcements = [created, ...announcements.filter((a) => a.id !== created.id)];
			text = '';
			level = 'info';
			expiry = '';
		} catch (e) {
			toast.error(`Couldn't send the announcement: ${getErrorMessage(e)}`);
		} finally {
			sending = false;
		}
	}

	async function end(announcement: AdminAnnouncement) {
		endingId = announcement.id;
		try {
			const ended = await endAnnouncement(announcement.id);
			announcements = announcements.map((a) => (a.id === ended.id ? ended : a));
		} catch (e) {
			toast.error(`Couldn't end the announcement: ${getErrorMessage(e)}`);
		} finally {
			endingId = null;
		}
	}

	const levelLabel = (value: AnnouncementLevel) =>
		ANNOUNCEMENT_LEVELS.find((l) => l.value === value)?.label ?? value;

	const fieldClass =
		'h-11 w-full rounded-[10px] border border-input bg-surface-input px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive';
</script>

<div class="mx-auto flex max-w-5xl flex-col gap-6">
	<h2 class="text-lg font-semibold">Announcements</h2>

	<form onsubmit={send} class="flex flex-col gap-4" aria-label="New announcement">
		<SettingsTextField
			id="announcement-text"
			label="Text"
			bind:value={text}
			maxlength={ANNOUNCEMENT_TEXT_MAX}
			error={textError}
			hint="Plain text, up to {ANNOUNCEMENT_TEXT_MAX} characters."
			multiline
		/>
		<div class="flex max-w-md flex-col gap-1.5">
			<label for="announcement-level" class="text-[13px] font-medium text-text-label">Level</label>
			<select id="announcement-level" bind:value={level} class={fieldClass}>
				{#each ANNOUNCEMENT_LEVELS as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>
		<div class="flex max-w-md flex-col gap-1.5">
			<label for="announcement-expiry" class="text-[13px] font-medium text-text-label">
				Expires (optional)
			</label>
			<input
				id="announcement-expiry"
				type="datetime-local"
				bind:value={expiry}
				aria-invalid={expiryError ? true : undefined}
				aria-describedby={expiryError ? 'announcement-expiry-error' : undefined}
				class={fieldClass}
			/>
			{#if expiryError}
				<p id="announcement-expiry-error" class="text-xs text-destructive">{expiryError}</p>
			{/if}
		</div>
		<div>
			<Button type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send announcement'}</Button>
		</div>
	</form>

	{#if loading}
		<LoadingList rows={3} />
	{:else if loadFailed}
		<ErrorState onRetry={load} />
	{:else if announcements.length === 0}
		<EmptyState title="No announcements yet" />
	{:else}
		<ul class="flex flex-col gap-3">
			{#each announcements as announcement (announcement.id)}
				<li class="flex flex-col gap-2 rounded-xl border border-border p-4">
					<div class="flex flex-wrap items-center gap-2 text-xs text-text-subtle">
						<span
							class="rounded-full px-2 py-0.5 text-[11px] leading-none font-medium {announcement.ended
								? 'bg-accent text-text-subtle'
								: 'bg-primary text-primary-foreground'}"
						>
							{announcement.ended ? 'Ended' : 'Active'}
						</span>
						<span class="font-medium">{levelLabel(announcement.level)}</span>
						<span>
							{announcement.created_by?.username ?? 'Deleted user'}, {timeAgo(
								announcement.created_at
							)}
						</span>
						{#if announcement.expires_at}
							<span>
								{announcement.ended ? 'Ended' : 'Ends'}
								<time datetime={announcement.expires_at}>
									{new Date(announcement.expires_at).toLocaleString()}
								</time>
							</span>
						{/if}
					</div>
					<p class="text-sm break-words whitespace-pre-wrap">{announcement.text}</p>
					{#if !announcement.ended}
						<div>
							<Button
								variant="secondary"
								size="sm"
								disabled={endingId === announcement.id}
								onclick={() => end(announcement)}
							>
								End now
							</Button>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
