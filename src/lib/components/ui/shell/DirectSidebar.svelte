<script lang="ts">
	import ConversationList from './ConversationList.svelte';
	import VoiceDock from './VoiceDock.svelte';
	import AccountRow from './AccountRow.svelte';
</script>

<aside class="flex w-[248px] shrink-0 flex-col border-r border-border bg-sidebar">
	<ConversationList />
	<VoiceDock />
	<AccountRow />
</aside>
