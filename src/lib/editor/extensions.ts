import StarterKit from '@tiptap/starter-kit';
import { MessageCodeBlock } from './codeBlock';

/** The nodes and marks a message can hold; the editor adds its behaviour on top. */
export const contentExtensions = [StarterKit.configure({ codeBlock: false }), MessageCodeBlock];
