<script lang="ts">
	import { Editor, Extension } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Mention from '@tiptap/extension-mention';
	import Placeholder from '@tiptap/extension-placeholder';
	import tippy, { type Instance } from 'tippy.js';
	import { mount, unmount } from 'svelte';
	import MentionList from './MentionList.svelte';
	import type { User } from '$lib/types/auth.types';
	import { serversState } from '$lib/states/serversState.svelte';
	import { socketState } from '$lib/states/socketState.svelte';

	let element: HTMLElement;
	let editor: Editor | null = $state(null);

	function handleSend() {
		if (!editor || editor.isEmpty) return;
		const messageAST = editor.getJSON();

		if (!serversState.selectedServer || !serversState.selectedChannel) return;

		socketState.sendMessage(messageAST);

		editor.commands.clearContent();
	}

	$effect(() => {
		if (!serversState.selectedServer) return;

		const ChatShortcuts = Extension.create({
			name: 'chatShortcuts',
			addKeyboardShortcuts() {
				return {
					Enter: ({ editor }) => {
						const multilineNodes = [
							'bulletList',
							'orderedList',
							'codeBlock',
							'blockquote',
							'heading'
						];
						const isMultiline = multilineNodes.some((node) => editor.isActive(node));
						if (isMultiline) {
							return false; // let Tiptap handle the enter key
						}
						handleSend();
						return true; // we handled it
					}
				};
			}
		});

		editor = new Editor({
			element: element,
			extensions: [
				StarterKit,
				ChatShortcuts,
				Placeholder.configure({
					placeholder: 'Type a message...',
					emptyEditorClass: 'is-editor-empty'
				}),
				Mention.configure({
					HTMLAttributes: {
						class: 'bg-indigo-500/20 text-indigo-400 font-semibold px-1.5 py-0.5 rounded-md'
					},
					suggestion: {
						items: ({ query }) => {
							return (serversState.selectedServer?.members || [])
								.filter((item) => item.username.toLowerCase().startsWith(query.toLowerCase()))
								.slice(0, 5);
						},
						render: () => {
							let popup: Instance[];
							let propsState = $state({
								items: [] as User[],
								command: (() => {}) as (props: { id: string; label: string }) => void
							});
							let component: ReturnType<typeof mount>;

							return {
								onStart: (props) => {
									propsState.items = props.items;
									propsState.command = props.command;

									// create container for the popup
									const targetDiv = document.createElement('div');

									// mount the MentionList component into the container
									// the props must be a getter object in Svelte 5 to remain reactive
									component = mount(MentionList, {
										target: targetDiv,
										props: {
											get items() {
												return propsState.items;
											},
											get command() {
												return propsState.command;
											}
										}
									});

									// Tippy.js for positioning
									popup = tippy('body', {
										getReferenceClientRect: props.clientRect as () => DOMRect,
										appendTo: () => document.body,
										content: targetDiv,
										showOnCreate: true,
										interactive: true,
										trigger: 'manual',
										placement: 'top-start'
									});
								},
								onUpdate: (props) => {
									// update the Svelte 5 state, the getter props will reactively propagate to the MentionList
									propsState.items = props.items;
									propsState.command = props.command;

									popup[0].setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
								},
								onKeyDown: (props) => {
									// forward the key presses to the Svelte component's onKeyDown function
									if (props.event.key === 'Escape') {
										popup[0].hide();
										return true;
									}
									const handled = component.onKeyDown(props.event);
									if (handled) {
										props.event.stopPropagation();
										props.event.preventDefault();
									}
									return handled;
								},
								onExit: () => {
									popup[0].destroy();
									unmount(component); // Svelte 5 DOM cleanup
								}
							};
						}
					}
				})
			],
			content: ''
		});

		return () => {
			editor?.destroy();
		};
	});
</script>

<div class="flex w-full flex-col bg-zinc-950 p-4">
	<div
		class="relative max-h-40 w-full overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-800 p-3 shadow-sm transition-colors focus-within:border-indigo-500 hover:border-zinc-600"
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={element}
			class="prose prose-sm w-full max-w-none wrap-break-word whitespace-pre-wrap text-zinc-100 prose-zinc outline-none dark:prose-invert prose-headings:my-1 prose-p:my-0 prose-ol:my-1 prose-ul:my-1 prose-li:my-0"
		></div>
	</div>
</div>

<style>
	/* Tiptap CSS */
	:global(.ProseMirror) {
		min-height: 24px;
		outline: none;
	}

	/* Placeholder CSS */
	:global(.ProseMirror p.is-editor-empty:first-child::before) {
		color: #71717a; /* Tailwind zinc-500 */
		content: attr(data-placeholder);
		float: left;
		height: 0;
		pointer-events: none;
	}
</style>
