import { Buffer } from 'node:buffer';
import { expect, test } from 'vitest';
import { Reader } from '../src/Reader.js';
import { Writer } from '../src/Writer.js';

test('encoding a tuple of 3 bools with no reserved bytes', () => {
	const writer = new Writer(0);
	writer.bool(true);
	writer.bool(false);
	writer.bool(true);

	const buffer = writer.dump();
	// type(bool) + bool(true) + type(bool) + bool(false) + type(bool) + bool(true)
	// type(bool) -> DataType.Bool = 1 = 0x01
	// bool(true) -> 1 = 0x01
	// bool(false) -> 0 = 0x00
	expect(buffer).toEqual(Buffer.from([0x01, 0x01, 0x01, 0x00, 0x01, 0x01]));

	const reader = new Reader(buffer);
	expect(reader.bool()).toBe(true);
	expect(reader.bool()).toBe(false);
	expect(reader.bool()).toBe(true);
});
