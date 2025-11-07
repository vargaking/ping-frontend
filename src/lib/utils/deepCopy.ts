/**
 * Deep copy a value.
 * Uses structuredClone when available, otherwise falls back to a robust custom clone.
 */
export function deepCopy<T>(value: T): T {
	// Prefer native structuredClone if available (preserves most built-ins and is fast)
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore - structuredClone may not be in every TS lib target
	if (typeof structuredClone === 'function') return (structuredClone as any)(value) as T;

	const seen = new WeakMap<object, unknown>();

	function _clone<TV>(val: TV): TV {
		// primitives, functions
		if (val === null || typeof val !== 'object') return val;

		const obj = val as unknown as object;

		const cached = seen.get(obj);
		if (cached) return cached as TV;

		// Date
		if (obj instanceof Date) return new Date(obj.getTime()) as unknown as TV;

		// RegExp
		if (obj instanceof RegExp) {
			const r = new RegExp((obj as RegExp).source, (obj as RegExp).flags);
			(r as RegExp).lastIndex = (obj as RegExp).lastIndex;
			return r as unknown as TV;
		}

		// Array
		if (Array.isArray(obj)) {
			const out: unknown[] = [];
			seen.set(obj, out);
			const src = obj as unknown as unknown[];
			for (let i = 0; i < src.length; i++) out[i] = _clone(src[i]);
			return out as unknown as TV;
		}

		// Map
		if (obj instanceof Map) {
			const out = new Map<unknown, unknown>();
			seen.set(obj, out);
			(obj as Map<unknown, unknown>).forEach((v, k) => out.set(_clone(k), _clone(v)));
			return out as unknown as TV;
		}

		// Set
		if (obj instanceof Set) {
			const out = new Set<unknown>();
			seen.set(obj, out);
			(obj as Set<unknown>).forEach((v) => out.add(_clone(v)));
			return out as unknown as TV;
		}

		// ArrayBuffer
		if (obj instanceof ArrayBuffer) return obj.slice(0) as unknown as TV;

		// DataView
		if (obj instanceof DataView) {
			const copy = new DataView(obj.buffer.slice(0));
			seen.set(obj, copy);
			return copy as unknown as TV;
		}

		// Typed arrays
		if (obj instanceof Int8Array) return new Int8Array((obj as Int8Array).slice()) as unknown as TV;
		if (obj instanceof Uint8Array)
			return new Uint8Array((obj as Uint8Array).slice()) as unknown as TV;
		if (obj instanceof Uint8ClampedArray)
			return new Uint8ClampedArray((obj as Uint8ClampedArray).slice()) as unknown as TV;
		if (obj instanceof Int16Array)
			return new Int16Array((obj as Int16Array).slice()) as unknown as TV;
		if (obj instanceof Uint16Array)
			return new Uint16Array((obj as Uint16Array).slice()) as unknown as TV;
		if (obj instanceof Int32Array)
			return new Int32Array((obj as Int32Array).slice()) as unknown as TV;
		if (obj instanceof Uint32Array)
			return new Uint32Array((obj as Uint32Array).slice()) as unknown as TV;
		if (obj instanceof Float32Array)
			return new Float32Array((obj as Float32Array).slice()) as unknown as TV;
		if (obj instanceof Float64Array)
			return new Float64Array((obj as Float64Array).slice()) as unknown as TV;
		if (typeof BigInt64Array !== 'undefined' && obj instanceof BigInt64Array)
			return new BigInt64Array((obj as BigInt64Array).slice()) as unknown as TV;
		if (typeof BigUint64Array !== 'undefined' && obj instanceof BigUint64Array)
			return new BigUint64Array((obj as BigUint64Array).slice()) as unknown as TV;

		// Generic objects (preserve prototype and property descriptors)
		const proto = Object.getPrototypeOf(obj);
		const out = Object.create(proto);
		seen.set(obj, out);

		const descriptors = Object.getOwnPropertyDescriptors(obj);
		for (const [k, desc] of Object.entries(descriptors)) {
			if ('value' in desc)
				(desc as PropertyDescriptor).value = _clone((desc as PropertyDescriptor).value as unknown);
			Object.defineProperty(out, k, desc as PropertyDescriptor);
		}

		const symbols = Object.getOwnPropertySymbols(obj);
		for (const s of symbols) {
			const desc = Object.getOwnPropertyDescriptor(obj, s);
			if (!desc) continue;
			if ('value' in desc) desc.value = _clone((desc as PropertyDescriptor).value as unknown);
			Object.defineProperty(out, s, desc);
		}

		return out as TV;
	}

	return _clone(value) as T;
}

export default deepCopy;
