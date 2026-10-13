export type QualityLimit = 'cpu' | 'bandwidth' | null;

export type ScreenOutput = {
	width: number;
	height: number;
	fps: number;
	limit: QualityLimit;
	/** The preset's height when the shared screen is shorter than it. */
	sourceBelow: number | null;
};

type SenderLayer = {
	frameWidth?: number;
	frameHeight?: number;
	framesPerSecond?: number;
	qualityLimitationReason?: string;
};

export function screenOutputText(output: ScreenOutput): string {
	const { width, height, fps, limit, sourceBelow } = output;
	let text = `Sending ${width}×${height}, ${fps} fps`;
	if (sourceBelow) text += ` (your screen is smaller than ${sourceBelow}p)`;
	if (limit) text += `, limited by ${limit === 'cpu' ? 'CPU' : 'bandwidth'}`;
	return text;
}

/** The top layer's live size, fps and limit. Null while it isn't sending, e.g. when nobody watches it. */
export function topLayerSample(
	layers: SenderLayer[]
): Pick<ScreenOutput, 'width' | 'height' | 'fps' | 'limit'> | null {
	let top: SenderLayer | undefined;
	for (const layer of layers) {
		if ((layer.frameWidth ?? 0) > (top?.frameWidth ?? 0)) top = layer;
	}
	if (!top?.frameWidth || !top.frameHeight || !top.framesPerSecond) return null;
	const reason = top.qualityLimitationReason;
	return {
		width: top.frameWidth,
		height: top.frameHeight,
		fps: Math.round(top.framesPerSecond),
		limit: reason === 'cpu' || reason === 'bandwidth' ? reason : null
	};
}
