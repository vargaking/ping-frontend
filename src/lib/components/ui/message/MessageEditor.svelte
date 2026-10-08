<script lang="ts">
	import { Editor, Extension, type FocusPosition, type JSONContent } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Mention from '@tiptap/extension-mention';
	import Placeholder from '@tiptap/extension-placeholder';
	import tippy, { type Instance } from 'tippy.js';
	import { mount, unmount, untrack } from 'svelte';
	import MentionList from '$lib/components/ui/MentionList.svelte';
	import type { User } from '$lib/types/auth.types';
	import { usersState } from '$lib/states/usersState.svelte';
	import { phoneState } from '$lib/states/phoneState.svelte';

	let {
		content = '',
		placeholder = 'Type a message…',
		isEmpty = $bindable(true),
		autofocus = false,
		allowEmpty = false,
		editorClass = '',
		mentionCandidates,
		onSubmit,
		onChange,
		onCancel,
		onArrowUp
	}: {
		content?: JSONContent | string;
		placeholder?: string;
		isEmpty?: boolean;
		autofocus?: boolean;
		/** Submit even when the editor has no text (e.g. attachments carry the message). */
		allowEmpty?: boolean;
		editorClass?: string;
		/** Who the @mention list can suggest; without it there are no suggestions. */
		mentionCandidates?: () => User[];
		onSubmit: (json: JSONContent) => void;
		/** Called after every edit to the content. */
		onChange?: (json: JSONContent) => void;
		onCancel?: () => void;
		onArrowUp?: () => void;
	} = $props();

	let element: HTMLElement;
	let editor: Editor | null = $state(null);

	export function submit() {
		if (!editor || (editor.isEmpty && !allowEmpty)) return;
		onSubmit(editor.getJSON());
	}

	export function clear() {
		editor?.commands.clearContent();
	}

	export function insertText(text: string) {
		editor?.chain().focus().insertContent(text).run();
	}

	export function focus(position: FocusPosition = 'end') {
		editor?.commands.focus(position);
	}

	// Tiptap's focus command waits a frame, which is too late for the key that triggered it.
	export function focusNow() {
		editor?.view.focus();
	}

	$effect(() => {
		const initialContent = untrack(() => content);

		const Shortcuts = Extension.create({
			name: 'messageEditorShortcuts',
			addKeyboardShortcuts() {
				return {
					Enter: ({ editor }) => {
						// Touch keyboards have no Shift+Enter, so Enter is a newline and the send button sends.
						if (phoneState.touch) return false;
						const multilineNodes = [
							'bulletList',
							'orderedList',
							'codeBlock',
							'blockquote',
							'heading'
						];
						if (multilineNodes.some((node) => editor.isActive(node))) {
							return false; // let Tiptap insert a newline
						}
						submit();
						return true;
					},
					Escape: () => {
						if (!onCancel) return false;
						onCancel();
						return true;
					},
					ArrowUp: ({ editor }) => {
						if (!onArrowUp || !editor.isEmpty) return false;
						onArrowUp();
						return true;
					}
				};
			}
		});

		const instance = new Editor({
			element,
			content: initialContent,
			onCreate: ({ editor }) => {
				isEmpty = editor.isEmpty;
			},
			onUpdate: ({ editor }) => onChange?.(editor.getJSON()),
			onTransaction: ({ editor }) => {
				// Removing a focused editor fires a blur transaction mid-teardown,
				// where writing state throws; blur never changes emptiness. Read
				// untracked: this also runs inside the creating effect (autofocus),
				// and tracking isEmpty there would rebuild the editor.
				if (editor.isEmpty !== untrack(() => isEmpty)) isEmpty = editor.isEmpty;
			},
			extensions: [
				StarterKit,
				Shortcuts,
				Placeholder.configure({
					placeholder,
					emptyEditorClass: 'is-editor-empty'
				}),
				Mention.configure({
					HTMLAttributes: {
						class: 'bg-primary/15 text-primary font-semibold px-1.5 py-0.5 rounded-md'
					},
					suggestion: {
						items: ({ query }) => {
							return (mentionCandidates?.() ?? [])
								.map((m) => usersState.users[m.id] ?? m)
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
			]
		});

		// Assign the reactive handle only after construction, and drive autofocus
		// off the local instance. Reading the `editor` $state we just wrote from
		// inside this effect would make the effect depend on a value it sets,
		// looping forever (effect_update_depth_exceeded) — which is exactly what
		// the autofocus path did before.
		editor = instance;
		if (autofocus) instance.commands.focus('end');

		return () => {
			instance.destroy();
			editor = null;
		};
	});
</script>

<div bind:this={element} class={editorClass}></div>

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
