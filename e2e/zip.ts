const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

function crc32(data: Buffer): number {
	let crc = 0xffffffff;
	for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

// 1980-01-01 00:00:00, the earliest time a zip can hold.
const DOS_TIME = 0;
const DOS_DATE = 0x21;
const UTF8_NAMES = 0x0800;

/** A zip with every file stored uncompressed; enough for tests, and needs no dependency. */
export function storedZip(files: Record<string, string>): Buffer {
	const parts: Buffer[] = [];
	const central: Buffer[] = [];
	let offset = 0;

	for (const [name, text] of Object.entries(files)) {
		const nameBytes = Buffer.from(name, 'utf8');
		const data = Buffer.from(text, 'utf8');
		const crc = crc32(data);

		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(UTF8_NAMES, 6);
		local.writeUInt16LE(0, 8);
		local.writeUInt16LE(DOS_TIME, 10);
		local.writeUInt16LE(DOS_DATE, 12);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(data.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(nameBytes.length, 26);
		local.writeUInt16LE(0, 28);
		parts.push(local, nameBytes, data);

		const entry = Buffer.alloc(46);
		entry.writeUInt32LE(0x02014b50, 0);
		entry.writeUInt16LE(20, 4);
		entry.writeUInt16LE(20, 6);
		entry.writeUInt16LE(UTF8_NAMES, 8);
		entry.writeUInt16LE(0, 10);
		entry.writeUInt16LE(DOS_TIME, 12);
		entry.writeUInt16LE(DOS_DATE, 14);
		entry.writeUInt32LE(crc, 16);
		entry.writeUInt32LE(data.length, 20);
		entry.writeUInt32LE(data.length, 24);
		entry.writeUInt16LE(nameBytes.length, 28);
		entry.writeUInt32LE(offset, 42);
		central.push(entry, nameBytes);

		offset += local.length + nameBytes.length + data.length;
	}

	const directory = Buffer.concat(central);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(Object.keys(files).length, 8);
	end.writeUInt16LE(Object.keys(files).length, 10);
	end.writeUInt32LE(directory.length, 12);
	end.writeUInt32LE(offset, 16);

	return Buffer.concat([...parts, directory, end]);
}
