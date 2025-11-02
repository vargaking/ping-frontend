<script>
	// @ts-nocheck

	import ChatSVG from '$lib/components/icons/ChatSVG.svelte';
	import PlusSVG from '$lib/components/icons/PlusSVG.svelte';
	import SidebarItem from './SidebarItem.svelte';
</script>

<div class="flex h-screen w-16 flex-col items-center gap-4 border-r border-border py-4">
	<SidebarItem icon={ChatSVG} href="/direct" label="Direct Messages" />

	<hr class="mx-2 w-2/3 rounded border border-border" />

	<SidebarItem icon={PlusSVG} href="/add-server" label="Add Server" />
</div>
