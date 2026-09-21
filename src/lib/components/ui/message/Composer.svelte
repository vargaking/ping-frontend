<script lang="ts">
	import { Editor, Extension } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Mention from '@tiptap/extension-mention';
	import Placeholder from '@tiptap/extension-placeholder';
	import tippy, { type Instance } from 'tippy.js';
	import { mount, unmount } from 'svelte';
	import MentionList from '$lib/components/ui/MentionList.svelte';
	import type { User } from '$lib/types/auth.types';
	import { serversState } from '$lib/states/serversState.svelte';
	import { socketState } from '$lib/states/socketState.svelte';
	import { Paperclip, Smile, SendHorizontal } from 'lucide-svelte';

	let element: HTMLElement;
	let editor: Editor | null = $state(null);
	let isEmpty = $state(true);

	function handleSend() {
		if (!editor || editor.isEmpty) return;
		const messageAST = editor.getJSON();

		if (!serversState.selectedServer || !serversState.selectedChannel) return;

		socketState.sendMessage(messageAST);
		editor.commands.clearContent();
		editor.commands.focus();
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
			onTransaction: () => {
				isEmpty = editor?.isEmpty ?? true;
			},
			extensions: [
				StarterKit,
				ChatShortcuts,
				Placeholder.configure({
					placeholder: 'Type a message…',
					emptyEditorClass: 'is-editor-empty'
				}),
				Mention.configure({
					HTMLAttributes: {
						class: 'bg-primary/15 text-primary font-semibold px-1.5 py-0.5 rounded-md'
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

									const targetDiv = document.createElement('div');

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
									propsState.items = props.items;
									propsState.command = props.command;

									popup[0].setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
								},
								onKeyDown: (props) => {
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
									unmount(component);
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

<div class="px-8 pb-6">
	<div
		class="flex min-h-[52px] items-end gap-1 rounded-xl border border-input bg-surface-input py-2 pr-2 pl-2.5 transition-colors focus-within:border-ring"
	>
		<button
			type="button"
			aria-label="Attach a file"
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			<Paperclip size={18} strokeWidth={1.75} />
		</button>

		<div
			bind:this={element}
			class="prose prose-sm max-h-40 w-full max-w-none min-w-0 flex-1 self-center overflow-y-auto py-1.5 text-[15px] break-words whitespace-pre-wrap text-foreground prose-invert outline-none prose-headings:my-1 prose-p:my-0 prose-ol:my-1 prose-ul:my-1 prose-li:my-0"
		></div>

		<button
			type="button"
			aria-label="Add emoji"
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			<Smile size={18} strokeWidth={1.75} />
		</button>

		<button
			type="button"
			aria-label="Send message"
			onclick={handleSend}
			disabled={isEmpty}
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-input focus-visible:outline-none disabled:opacity-40"
		>
			<SendHorizontal size={18} strokeWidth={1.75} />
		</button>
	</div>
</div>

<style>
	:global(.ProseMirror) {
		min-height: 24px;
		outline: none;
	}

	:global(.ProseMirror p.is-editor-empty:first-child::before) {
		color: var(--text-subtle);
		content: attr(data-placeholder);
		float: left;
		height: 0;
		pointer-events: none;
	}
</style>
