import { expect, test } from 'vitest';
import { DataType } from '../src/Data.js';
import { createRecipe } from '../src/recipe/recipe.js';

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
