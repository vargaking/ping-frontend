<script lang="ts">
	import ChannelList from './ChannelList.svelte';
	import VoiceDock from './VoiceDock.svelte';
	import AccountRow from './AccountRow.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip/index';
</script>

<aside class="flex w-[248px] shrink-0 flex-col border-r border-border bg-sidebar">
	<Tooltip.Provider>
		<ChannelList />
	</Tooltip.Provider>
	<VoiceDock />
	<AccountRow />
</aside>
