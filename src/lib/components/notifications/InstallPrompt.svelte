<script lang="ts">
	import { SquarePlus } from '@lucide/svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { installState } from '$lib/states/installState.svelte';
</script>

<div class="pointer-events-none fixed inset-x-3 top-(--notice-top) z-40" aria-live="polite">
	{#if installState.visible}
		<div
			class="pointer-events-auto flex flex-col gap-3 rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg"
			role="region"
			aria-label="Install"
		>
			<div class="flex items-start gap-3">
				<SquarePlus class="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
				<div class="flex flex-col gap-1">
					<span class="text-sm font-medium">Install Zeta</span>
					{#if installState.hint === 'install-prompt'}
						<span class="text-xs text-muted-foreground">
							Add it to your home screen to open it like an app and get notifications.
						</span>
					{:else}
						<span class="text-xs text-muted-foreground">
							Tap Share, then Add to Home Screen. Notifications only work from the installed app.
						</span>
					{/if}
				</div>
			</div>
			<div class="flex justify-end gap-2">
				<Button size="sm" variant="ghost" onclick={() => installState.dismiss()}>Dismiss</Button>
				{#if installState.hint === 'install-prompt'}
					<Button size="sm" onclick={() => installState.install()}>Install</Button>
				{/if}
			</div>
		</div>
	{/if}
</div>
