<script lang="ts">
	import { closeNavOnPageLink } from '$lib/states/phoneState.svelte';
	import ConversationList from './ConversationList.svelte';
	import VoiceDock from './VoiceDock.svelte';
	import AccountRow from './AccountRow.svelte';
</script>

<aside
	aria-label="Conversations"
	class="flex w-[248px] shrink-0 flex-col border-r border-border bg-sidebar max-md:w-auto max-md:min-w-0 max-md:flex-1"
	use:closeNavOnPageLink
>
	<ConversationList />
	<VoiceDock />
	<AccountRow />
</aside>
