import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";

import Item from "./dropdown-menu-item.svelte";
import Content from "./dropdown-menu-content.svelte";
import Trigger from "./dropdown-menu-trigger.svelte";
import Separator from "./dropdown-menu-separator.svelte";

const Root = DropdownMenuPrimitive.Root;
const Group = DropdownMenuPrimitive.Group;

export {
	Root,
	Item,
	Content,
	Trigger,
	Separator,
	Group,
	//
	Root as DropdownMenu,
	Item as DropdownMenuItem,
	Content as DropdownMenuContent,
	Trigger as DropdownMenuTrigger,
	Separator as DropdownMenuSeparator,
	Group as DropdownMenuGroup,
};
