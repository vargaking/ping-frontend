export type TokenKind =
	| 'keyword'
	| 'string'
	| 'number'
	| 'comment'
	| 'function'
	| 'type'
	| 'variable'
	| 'meta'
	| 'punctuation';

export type Token = { text: string; kind: TokenKind | null };

type Highlight = (code: string, language: string) => Token[];

type HastNode = {
	type: string;
	value?: string;
	properties?: { className?: unknown };
	children?: HastNode[];
};

// highlight.js scope (the class without its "hljs-" prefix) → our kind.
const SCOPE_KIND: Record<string, TokenKind> = {
	keyword: 'keyword',
	literal: 'keyword',
	doctag: 'keyword',
	tag: 'keyword',
	name: 'keyword',
	'selector-tag': 'keyword',
	'selector-id': 'keyword',
	'selector-class': 'keyword',
	'selector-attr': 'keyword',
	'selector-pseudo': 'keyword',
	section: 'keyword',
	string: 'string',
	regexp: 'string',
	char: 'string',
	addition: 'string',
	link: 'string',
	number: 'number',
	bullet: 'number',
	comment: 'comment',
	quote: 'comment',
	deletion: 'comment',
	attr: 'function',
	attribute: 'function',
	property: 'function',
	title: 'function',
	built_in: 'type',
	type: 'type',
	class: 'type',
	variable: 'variable',
	'template-variable': 'variable',
	params: 'variable',
	subst: 'variable',
	meta: 'meta',
	symbol: 'meta',
	operator: 'punctuation',
	punctuation: 'punctuation'
};

function kindOf(classes: string[], inherited: TokenKind | null): TokenKind | null {
	const scope = classes.find((name) => name.startsWith('hljs-'))?.slice('hljs-'.length);
	if (!scope || !Object.hasOwn(SCOPE_KIND, scope)) return inherited;
	if (scope === 'title' && classes.includes('class_')) return 'type';
	if (scope === 'variable' && classes.includes('language_')) return 'keyword';
	return SCOPE_KIND[scope];
}

function flatten(node: HastNode, inherited: TokenKind | null, out: Token[]) {
	if (node.type === 'text') {
		const text = node.value ?? '';
		const last = out[out.length - 1];
		if (!text) return;
		if (last && last.kind === inherited) last.text += text;
		else out.push({ text, kind: inherited });
		return;
	}
	const className = node.properties?.className;
	const classes = Array.isArray(className) ? className.map(String) : [];
	const kind = node.type === 'element' ? kindOf(classes, inherited) : inherited;
	for (const child of node.children ?? []) flatten(child, kind, out);
}

let loading: Promise<Highlight> | null = null;

/** Loads lowlight with the common set once; later calls reuse it. */
export function loadHighlighter(): Promise<Highlight> {
	loading ??= import('lowlight')
		.then(({ createLowlight, common }) => {
			const lowlight = createLowlight(common);
			return (code: string, language: string) => {
				const tokens: Token[] = [];
				flatten(lowlight.highlight(language, code), null, tokens);
				return tokens;
			};
		})
		.catch((error) => {
			loading = null;
			throw error;
		});
	return loading;
}
