import { expect, expectTypeOf, test } from 'vitest';
import { DataType } from '../src/Data.js';
import { createRecipe, RecipeSchemaMismatchError, stringLiteral } from '../src/recipe/recipe.js';

test('encode/decode a full-fledged recipe', () => {
	const recipe = createRecipe({
		bool: DataType.Bool,
		str: DataType.String,
		someInt: DataType.I32,
		someUnsigned: DataType.U32,
		bigint: DataType.U64,
		date: DataType.Date,
		array: [DataType.String],
		object: {
			foo: DataType.String,
			bar: DataType.I32,
			deepArray: [
				{
					superDeep: DataType.String,
				},
			],
		},
	});

	const data = {
		bool: true,
		str: 'hello',
		someInt: 42,
		someUnsigned: 42,
		bigint: 42n,
		date: Date.now(),
		array: ['hello', 'world'],
		object: {
			foo: 'bar',
			bar: 42,
			deepArray: [
				{
					superDeep: 'hello',
				},
			],
		},
	};

	// Honestly I'm not working out what this should be in bin format to hard-code a test,
	// just decode back normally
	const encoded = recipe.encode(data);
	const decoded = recipe.decode(encoded);

	expect(decoded).toEqual(data);
});

test('recipe fields round-trip null, distinctly from empty/falsy values', () => {
	const recipe = createRecipe({
		bool: DataType.Bool,
		str: DataType.String,
		someInt: DataType.I32,
		bigint: DataType.U64,
		date: DataType.Date,
		array: [DataType.String],
		object: {
			foo: DataType.String,
			bar: DataType.I32,
		},
	});

	const data = {
		bool: null,
		str: null,
		someInt: 0,
		bigint: 0n,
		date: null,
		array: null,
		object: null,
	};

	const encoded = recipe.encode(data);
	const decoded = recipe.decode(encoded);

	expect(decoded).toEqual(data);
});

test('recipe preserves empty string, empty array and empty object as distinct from null', () => {
	const recipe = createRecipe({
		str: DataType.String,
		array: [DataType.String],
		object: {
			foo: DataType.String,
		},
	});

	const data = {
		str: '',
		array: [],
		object: {
			foo: '',
		},
	};

	const encoded = recipe.encode(data);
	const decoded = recipe.decode(encoded);

	expect(decoded).toEqual(data);
});

test('recipe array elements can individually be null', () => {
	const recipe = createRecipe({
		array: [DataType.String],
	});

	const data = {
		array: ['a', null, ''],
	};

	const encoded = recipe.encode(data);
	const decoded = recipe.decode(encoded);

	expect(decoded).toEqual(data);
});

test('a recipe can be a bare top-level array, without an object envelope', () => {
	const recipe = createRecipe([DataType.String]);
	expectTypeOf(recipe.decode).returns.toEqualTypeOf<(string | null)[] | null>();

	const data = ['a', 'b', 'c'];
	const encoded = recipe.encode(data);
	expect(recipe.decode(encoded)).toEqual(data);
});

test('a top-level array recipe round-trips null and [] distinctly', () => {
	const recipe = createRecipe([DataType.String]);

	const nullEncoded = recipe.encode(null);
	const emptyEncoded = recipe.encode([]);

	expect(nullEncoded).not.toEqual(emptyEncoded);
	expect(recipe.decode(nullEncoded)).toBeNull();
	expect(recipe.decode(emptyEncoded)).toEqual([]);
});

test('a top-level array recipe of objects round-trips', () => {
	const recipe = createRecipe([
		{
			id: DataType.String,
			position: DataType.I32,
		},
	]);

	const data = [
		{ id: 'a', position: 0 },
		{ id: 'b', position: 1 },
	];

	const encoded = recipe.encode(data);
	expect(recipe.decode(encoded)).toEqual(data);
});

test('stringLiteral narrows a String field to a literal union at the type level, with no runtime footprint', () => {
	const recipe = createRecipe({
		role: stringLiteral<'admin' | 'member'>(),
		roles: [stringLiteral<'admin' | 'member'>()],
	});

	// eslint-disable-next-line @typescript-eslint/unbound-method
	expectTypeOf(recipe.decode).returns.toEqualTypeOf<{
		role: 'admin' | 'member' | null;
		roles: ('admin' | 'member' | null)[] | null;
	}>();

	const data: { role: 'admin' | 'member' | null; roles: ('admin' | 'member' | null)[] | null } = {
		role: 'admin',
		roles: ['admin', 'member', null],
	};

	const encoded = recipe.encode(data);
	expect(recipe.decode(encoded)).toEqual(data);

	// Runtime representation is identical to a bare `DataType.String` field -- `stringLiteral` only
	// affects the type the recipe reports, never the bytes it writes.
	const literalOnlyRecipe = createRecipe({ role: stringLiteral<'admin' | 'member'>() });
	const plainStringRecipe = createRecipe({ role: DataType.String });
	expect(literalOnlyRecipe.encode({ role: 'admin' })).toEqual(plainStringRecipe.encode({ role: 'admin' }));
});

test('an unversioned recipe (the default) has no fingerprint overhead', () => {
	const unversioned = createRecipe({ str: DataType.String });
	const explicitlyUnversioned = createRecipe({ str: DataType.String }, { versioned: false });

	expect(unversioned.encode({ str: 'hello' })).toEqual(explicitlyUnversioned.encode({ str: 'hello' }));
});

test('a versioned recipe round-trips normally and carries a fingerprint prefix', () => {
	const unversioned = createRecipe({ str: DataType.String, num: DataType.I32 });
	const versioned = createRecipe({ str: DataType.String, num: DataType.I32 }, { versioned: true });

	const data = { str: 'hello', num: 42 };
	const versionedEncoded = versioned.encode(data);
	const unversionedEncoded = unversioned.encode(data);

	// The versioned buffer is strictly longer (a leading fingerprint) and decodes back to the same data.
	expect(versionedEncoded.byteLength).toBeGreaterThan(unversionedEncoded.byteLength);
	expect(versioned.decode(versionedEncoded)).toEqual(data);
});

test('two independently-created recipes with the same shape produce the same fingerprint', () => {
	const a = createRecipe({ str: DataType.String, num: DataType.I32 }, { versioned: true });
	const b = createRecipe({ str: DataType.String, num: DataType.I32 }, { versioned: true });

	const data = { str: 'hello', num: 42 };
	expect(a.encode(data)).toEqual(b.encode(data));
	expect(b.decode(a.encode(data))).toEqual(data);
});

test('decode() rejects data encoded by a recipe with a different shape', () => {
	const original = createRecipe({ str: DataType.String, num: DataType.I32 }, { versioned: true });
	// Same field count and a structurally-compatible type (I32 -> U32), but a renamed field and a
	// different primitive type -- a real shape drift, the kind a schema change would produce.
	const changed = createRecipe({ str: DataType.String, count: DataType.U32 }, { versioned: true });

	const encoded = original.encode({ str: 'hello', num: 42 });

	expect(() => changed.decode(encoded)).toThrow(RecipeSchemaMismatchError);
});

test('decode() rejects data encoded by a recipe with the same fields in a different order', () => {
	// bin-rw's format is purely positional, so field order is genuinely part of a recipe's shape --
	// reordering fields must produce a different fingerprint, not the same one.
	const original = createRecipe({ str: DataType.String, num: DataType.I32 }, { versioned: true });
	const reordered = createRecipe({ num: DataType.I32, str: DataType.String }, { versioned: true });

	const encoded = original.encode({ str: 'hello', num: 42 });

	expect(() => reordered.decode(encoded)).toThrow(RecipeSchemaMismatchError);
});

test('RecipeSchemaMismatchError carries the expected and actual fingerprints', () => {
	const original = createRecipe({ str: DataType.String }, { versioned: true });
	const changed = createRecipe({ str: DataType.String, extra: DataType.I32 }, { versioned: true });

	const encoded = original.encode({ str: 'hello' });

	try {
		changed.decode(encoded);
		expect.unreachable('expected decode() to throw');
	} catch (error) {
		expect(error).toBeInstanceOf(RecipeSchemaMismatchError);
		const mismatch = error as RecipeSchemaMismatchError;
		expect(mismatch.actualFingerprint).not.toBeNull();
		expect(mismatch.expectedFingerprint).not.toBe(mismatch.actualFingerprint);
	}
});

test('decoding legacy unversioned data with a versioned recipe fails loudly rather than silently corrupting', () => {
	const legacy = createRecipe({ str: DataType.String, num: DataType.I32 });
	const versioned = createRecipe({ str: DataType.String, num: DataType.I32 }, { versioned: true });

	const encoded = legacy.encode({ str: 'hello', num: 42 });

	// The legacy buffer's first byte is a String type tag, not U32's -- Reader's own tag validation
	// throws before the fingerprint check even gets a chance to run.
	expect(() => versioned.decode(encoded)).toThrow();
});
