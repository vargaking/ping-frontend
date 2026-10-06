<script lang="ts">
	import { closeNavOnPageLink } from '$lib/states/phoneState.svelte';
	import ChannelList from './ChannelList.svelte';
	import VoiceDock from './VoiceDock.svelte';
	import AccountRow from './AccountRow.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip/index';
</script>

<aside
	aria-label="Channels"
	class="flex w-[248px] shrink-0 flex-col border-r border-border bg-sidebar max-md:w-auto max-md:min-w-0 max-md:flex-1"
	use:closeNavOnPageLink
>
	<Tooltip.Provider>
		<ChannelList />
	</Tooltip.Provider>
	<VoiceDock />
	<AccountRow />
</aside>
