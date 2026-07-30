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

test('falsy primitives round-trip as themselves, not null', () => {
	const writer = new Writer(0);
	writer.bool(false);
	writer.i8(0);
	writer.u8(0);
	writer.i16(0);
	writer.u16(0);
	writer.i32(0);
	writer.u32(0);
	writer.u64(0n);

	const reader = new Reader(writer.dump());
	expect(reader.bool()).toBe(false);
	expect(reader.i8()).toBe(0);
	expect(reader.u8()).toBe(0);
	expect(reader.i16()).toBe(0);
	expect(reader.u16()).toBe(0);
	expect(reader.i32()).toBe(0);
	expect(reader.u32()).toBe(0);
	expect(reader.u64()).toBe(0n);
});

test('null primitives round-trip as null', () => {
	const writer = new Writer(0);
	writer.bool(null);
	writer.i8(null);
	writer.u8(null);
	writer.i16(null);
	writer.u16(null);
	writer.i32(null);
	writer.u32(null);
	writer.u64(null);
	writer.string(null);
	writer.date(null);

	const reader = new Reader(writer.dump());
	expect(reader.bool()).toBeNull();
	expect(reader.i8()).toBeNull();
	expect(reader.u8()).toBeNull();
	expect(reader.i16()).toBeNull();
	expect(reader.u16()).toBeNull();
	expect(reader.i32()).toBeNull();
	expect(reader.u32()).toBeNull();
	expect(reader.u64()).toBeNull();
	expect(reader.string()).toBeNull();
	expect(reader.date()).toBeNull();
});

test('empty string round-trips as "", not null', () => {
	const writer = new Writer(0);
	writer.string('');

	const reader = new Reader(writer.dump());
	expect(reader.string()).toBe('');
});

test('null string round-trips as null, distinctly from an empty string', () => {
	const nullBuffer = new Writer(0).string(null).dump();
	const emptyBuffer = new Writer(0).string('').dump();

	expect(nullBuffer).not.toEqual(emptyBuffer);
	expect(new Reader(nullBuffer).string()).toBeNull();
	expect(new Reader(emptyBuffer).string()).toBe('');
});

test('empty array round-trips as [], not null', () => {
	const writer = new Writer(0);
	writer.array<string>([], (buffer, value) => buffer.string(value));

	const reader = new Reader(writer.dump());
	expect(reader.array((buffer) => buffer.string())).toEqual([]);
});

test('null array round-trips as null, distinctly from an empty array', () => {
	const nullBuffer = new Writer(0).array<string>(null, (buffer, value) => buffer.string(value)).dump();
	const emptyBuffer = new Writer(0).array<string>([], (buffer, value) => buffer.string(value)).dump();

	expect(nullBuffer).not.toEqual(emptyBuffer);
	expect(new Reader(nullBuffer).array((buffer) => buffer.string())).toBeNull();
	expect(new Reader(emptyBuffer).array((buffer) => buffer.string())).toEqual([]);
});

test('array of nullable strings preserves null elements', () => {
	const writer = new Writer(0);
	writer.array<string | null>(['a', null, ''], (buffer, value) => buffer.string(value));

	const reader = new Reader(writer.dump());
	expect(reader.array((buffer) => buffer.string())).toEqual(['a', null, '']);
});

test('empty object round-trips as {}, not null', () => {
	const writer = new Writer(0);
	writer.object({}, () => {});

	const reader = new Reader(writer.dump());
	expect(reader.object(() => ({}))).toEqual({});
});

test('null object round-trips as null, distinctly from an empty object', () => {
	const nullBuffer = new Writer(0).object(null, () => {}).dump();
	const emptyBuffer = new Writer(0).object({}, () => {}).dump();

	expect(nullBuffer).not.toEqual(emptyBuffer);
	expect(new Reader(nullBuffer).object(() => ({}))).toBeNull();
	expect(new Reader(emptyBuffer).object(() => ({}))).toEqual({});
});
