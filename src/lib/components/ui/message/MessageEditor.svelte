<script lang="ts">
	import { Editor, Extension, type FocusPosition, type JSONContent } from '@tiptap/core';
	import Mention from '@tiptap/extension-mention';
	import Placeholder from '@tiptap/extension-placeholder';
	import tippy, { type Instance } from 'tippy.js';
	import { mount, unmount, untrack } from 'svelte';
	import MentionList from '$lib/components/ui/MentionList.svelte';
	import type { User } from '$lib/types/auth.types';
	import { phoneState } from '$lib/states/phoneState.svelte';
	import { contentExtensions } from '$lib/editor/extensions';
	import { closeFencedCode, openFencedCode } from '$lib/editor/fenceShortcuts';
	import { MarkdownLinks } from '$lib/editor/markdownLinks';
	import { MarkdownPaste } from '$lib/editor/markdownPaste';
	import { withoutTrailingEmptyParagraphs } from '$lib/editor/trimDocument';
	import { mentionSuggestions } from '$lib/utils/mentions';

	let {
		content = '',
		placeholder = 'Type a message…',
		isEmpty = $bindable(true),
		autofocus = false,
		allowEmpty = false,
		editorClass = '',
		mentionCandidates,
		onMentionStart,
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
		/** Called when the mention list opens, to bring the candidates up to date. */
		onMentionStart?: () => void;
		onSubmit: (json: JSONContent) => void;
		/** Called after every edit to the content. */
		onChange?: (json: JSONContent) => void;
		onCancel?: () => void;
		onArrowUp?: () => void;
	} = $props();

	let element: HTMLElement;
	const suggest = (query: string) => mentionSuggestions(mentionCandidates?.() ?? [], query);
	let editor: Editor | null = $state(null);

	export function submit() {
		if (!editor || (editor.isEmpty && !allowEmpty)) return;
		onSubmit(withoutTrailingEmptyParagraphs(editor.getJSON()));
	}

	export function getJSON(): JSONContent | null {
		return editor ? withoutTrailingEmptyParagraphs(editor.getJSON()) : null;
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
			priority: 1000,
			addKeyboardShortcuts() {
				return {
					Enter: ({ editor }) => {
						if (openFencedCode(editor) || closeFencedCode(editor)) return true;
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
					'Mod-Enter': () => {
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
				...contentExtensions,
				MarkdownPaste,
				MarkdownLinks,
				Shortcuts,
				Placeholder.configure({
					placeholder,
					emptyEditorClass: 'is-editor-empty'
				}),
				// Above Shortcuts, so Enter and Escape reach an open mention list first.
				Mention.extend({ priority: 1100 }).configure({
					HTMLAttributes: {
						class: 'bg-primary/15 text-primary font-semibold px-1.5 py-0.5 rounded-md'
					},
					suggestion: {
						items: ({ query }) => suggest(query),
						render: () => {
							let popup: Instance[];
							let propsState = $state({
								query: '',
								command: (() => {}) as (props: { id: string; label: string }) => void
							});
							// Derived from the query rather than taken from the plugin, so the open
							// list follows members, names and access as they change.
							const items = $derived(suggest(propsState.query));
							let component: ReturnType<typeof mount>;

							return {
								onStart: (props) => {
									propsState.query = props.query;
									propsState.command = props.command;
									onMentionStart?.();

									const targetDiv = document.createElement('div');
									targetDiv.dataset.escapeLayer = '';

									component = mount(MentionList, {
										target: targetDiv,
										props: {
											get items() {
												return items;
											},
											get query() {
												return propsState.query;
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
									propsState.query = props.query;
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
