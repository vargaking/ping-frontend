<script lang="ts">
	import { usersState } from '$lib/states/usersState.svelte';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import SettingsModal from '$lib/components/settings/SettingsModal.svelte';
	import { Settings } from 'lucide-svelte';
</script>

<div class="flex items-center gap-2.5 border-t border-border px-3 py-2.5">
	<Avatar user={usersState.loggedInUser} size="sm" rounded="rounded-[9px]" />
	<div class="flex min-w-0 flex-1 flex-col">
		<span class="truncate text-[13px] font-medium">{usersState.loggedInUser?.username ?? '—'}</span>
		<span class="text-xs text-text-subtle">Online</span>
	</div>
	<button
		type="button"
		aria-label="Account settings"
		onclick={() => overlayState.open(SettingsModal, { category: 'account' })}
		class="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
	>
		<Settings size={18} strokeWidth={1.75} />
	</button>
</div>
