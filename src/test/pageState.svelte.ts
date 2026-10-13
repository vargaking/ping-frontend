/** A reactive stand-in for `page` from `$app/state`. */
export const page = $state<{ route: { id: string | null }; params: Record<string, string> }>({
	route: { id: null },
	params: {}
});
