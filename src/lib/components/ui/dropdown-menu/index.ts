import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';

import Item from './dropdown-menu-item.svelte';
import Content from './dropdown-menu-content.svelte';
import Trigger from './dropdown-menu-trigger.svelte';
import Separator from './dropdown-menu-separator.svelte';
import SubTrigger from './dropdown-menu-sub-trigger.svelte';
import SubContent from './dropdown-menu-sub-content.svelte';
import RadioItem from './dropdown-menu-radio-item.svelte';

const Root = DropdownMenuPrimitive.Root;
const Group = DropdownMenuPrimitive.Group;
const Sub = DropdownMenuPrimitive.Sub;
const RadioGroup = DropdownMenuPrimitive.RadioGroup;

export {
	Root,
	Item,
	Content,
	Trigger,
	Separator,
	Group,
	Sub,
	SubTrigger,
	SubContent,
	RadioGroup,
	RadioItem,
	//
	Root as DropdownMenu,
	Item as DropdownMenuItem,
	Content as DropdownMenuContent,
	Trigger as DropdownMenuTrigger,
	Separator as DropdownMenuSeparator,
	Group as DropdownMenuGroup,
	Sub as DropdownMenuSub,
	SubTrigger as DropdownMenuSubTrigger,
	SubContent as DropdownMenuSubContent,
	RadioGroup as DropdownMenuRadioGroup,
	RadioItem as DropdownMenuRadioItem
};
