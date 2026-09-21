<script lang="ts">
	import ChannelList from './ChannelList.svelte';
	import VoiceDock from './VoiceDock.svelte';
	import AccountRow from './AccountRow.svelte';
</script>

<aside class="flex w-[248px] shrink-0 flex-col border-r border-border bg-sidebar">
	<ChannelList />
	<VoiceDock />
	<AccountRow />
</aside>
