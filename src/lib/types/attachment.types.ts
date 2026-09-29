export type Attachment = {
	id: string;
	filename: string;
	content_type: string;
	size: number;
	kind: 'image' | 'file';
	width: number | null;
	height: number | null;
	url: string;
};
