<script lang="ts">
	import { usersState } from '$lib/states/usersState.svelte';
	import { whatsNewState } from '$lib/states/whatsNewState.svelte';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import SettingsModal from '$lib/components/settings/SettingsModal.svelte';
	import WhatsNewPanel from '$lib/components/whatsNew/WhatsNewPanel.svelte';
	import { Settings, Shield, Sparkles } from 'lucide-svelte';
</script>

<div
	class="flex items-center gap-2.5 border-t border-border px-3 pt-2.5 pb-[calc(0.625rem+var(--safe-bottom))]"
>
	<Avatar user={usersState.loggedInUser} size="sm" rounded="rounded-[9px]" />
	<div class="flex min-w-0 flex-1 flex-col">
		<span class="truncate text-[13px] font-medium">{usersState.loggedInUser?.username ?? '—'}</span>
		<span class="text-xs text-text-subtle">Online</span>
	</div>
	{#if usersState.loggedInUser?.is_platform_admin}
		<a
			href="/admin/"
			aria-label="Admin"
			class="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:h-11 pointer-coarse:w-11"
		>
			<Shield size={18} strokeWidth={1.75} />
		</a>
	{/if}
	<div class="relative">
		<button
			type="button"
			aria-label={whatsNewState.hasUnseen ? "What's new, new updates" : "What's new"}
			onclick={() => overlayState.open(WhatsNewPanel)}
			class="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:h-11 pointer-coarse:w-11"
		>
			<Sparkles size={18} strokeWidth={1.75} />
		</button>
		{#if whatsNewState.hasUnseen}
			<span
				class="pointer-events-none absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-sidebar"
				aria-hidden="true"
			></span>
		{/if}
	</div>
	<button
		type="button"
		aria-label="Account settings"
		onclick={() => overlayState.open(SettingsModal, { category: 'account' })}
		class="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:h-11 pointer-coarse:w-11"
	>
		<Settings size={18} strokeWidth={1.75} />
	</button>
</div>
