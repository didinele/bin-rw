import type { Buffer } from 'node:buffer';
import { DataType, type SimpleDataType, type SimpleDataTypeToPrimitiveMap } from '../Data';
import { Reader } from '../Reader';
import { Writer } from '../Writer';

export interface RecipeBlueprint {
	[K: string]: RecipeBlueprint | SimpleDataType | [RecipeBlueprint | SimpleDataType];
}

declare const stringLiteralBrand: unique symbol;

/**
 * A `DataType.String` field whose decoded value is narrowed to a specific string literal/union type `T`
 * instead of the default `string`. This is purely a compile-time annotation, on the same trust model
 * `createRecipe` already applies everywhere else: `T` is never validated at runtime, so a caller that
 * bypasses the type system (or a stale reader decoding data written by a newer/looser writer) can still
 * end up with a value outside `T`. The runtime representation is identical to a bare `DataType.String` --
 * `stringLiteral()` returns the same enum value, just typed as carrying the extra brand.
 */
export type StringLiteral<T extends string> = DataType.String & { readonly [stringLiteralBrand]: T };

export function stringLiteral<T extends string>(): StringLiteral<T> {
	return DataType.String as StringLiteral<T>;
}

export type RecipeBlueprintToData<
	TBlueprint extends RecipeBlueprint | SimpleDataType | [RecipeBlueprint | SimpleDataType],
> = TBlueprint extends StringLiteral<infer TLiteral>
	? TLiteral | null
	: TBlueprint extends SimpleDataType
	? SimpleDataTypeToPrimitiveMap[TBlueprint]
	: TBlueprint extends [RecipeBlueprint | SimpleDataType]
	? RecipeBlueprintToData<TBlueprint[0]>[] | null
	: {
			[K in keyof TBlueprint]: TBlueprint[K] extends StringLiteral<infer TFieldLiteral>
				? TFieldLiteral | null
				: TBlueprint[K] extends SimpleDataType
				? SimpleDataTypeToPrimitiveMap[TBlueprint[K]]
				: TBlueprint[K] extends RecipeBlueprint
				? RecipeBlueprintToData<TBlueprint[K]> | null
				: TBlueprint[K] extends [RecipeBlueprint | SimpleDataType]
				? RecipeBlueprintToData<TBlueprint[K][0]>[] | null
				: never;
	  };

export interface Recipe<TData> {
	decode(buffer: Buffer): TData;
	encode(data: TData): Buffer;
}

/**
 * Thrown by a `versioned` recipe's `decode()` when the buffer's leading fingerprint doesn't match the
 * recipe's own -- i.e. the bytes were written by a recipe with a different field set, order, or types.
 * Catch this specifically to treat mismatched data as absent (e.g. a cache miss) rather than as a
 * corrupt/unreadable payload.
 */
export class RecipeSchemaMismatchError extends Error {
	public constructor(
		public readonly expectedFingerprint: number,
		public readonly actualFingerprint: number | null,
	) {
		super(
			`Recipe schema mismatch: expected fingerprint ${expectedFingerprint}, got ${
				actualFingerprint ?? 'null'
			}. This usually means the data was encoded by a recipe with a different shape (fields, order, or types).`,
		);
		this.name = 'RecipeSchemaMismatchError';
	}
}

export interface CreateRecipeOptions {
	/**
	 * Initial buffer size to preallocate for `encode()`, in bytes.
	 *
	 * @defaultValue `0`, the buffer grows on demand.
	 */
	prealloc?: number;
	/**
	 * Prefixes every encoded buffer with a fingerprint derived from this recipe's exact field names,
	 * order, and types, and makes `decode()` throw a {@link RecipeSchemaMismatchError} instead of
	 * either a confusing type-tag error or, worse, silently misreading offsets, whenever the bytes being
	 * read weren't produced by a recipe with this exact shape.
	 *
	 * Opt-in because it changes the wire format: turning this on for a recipe with pre-existing encoded
	 * data (e.g. an already-populated cache) means every entry written before the change will now fail
	 * the fingerprint check on the next read -- for a cache that's a fine (arguably correct) failure mode,
	 * but it's a deliberate wire-format change, not a free toggle.
	 *
	 * The fingerprint only guards against *shape* drift (fields/types/nesting changing). It intentionally
	 * doesn't attempt to support additive schema evolution (e.g. "a new optional field is safe to add
	 * without invalidating old data") -- every shape change is treated as a mismatch.
	 *
	 * @defaultValue `false`
	 */
	versioned?: boolean;
}

const FNV_OFFSET_BASIS_32 = 0x81_1c_9d_c5;
const FNV_PRIME_32 = 0x01_00_01_93;

function fnv1a32(input: string): number {
	let hash = FNV_OFFSET_BASIS_32;

	for (let index = 0; index < input.length; index++) {
		hash ^= input.codePointAt(index)!;
		hash = Math.imul(hash, FNV_PRIME_32);
	}

	return hash >>> 0;
}

// Deterministic, order-sensitive string representation of a blueprint's shape (field names, nesting, and
// `DataType` tags) -- the input `fnv1a32` hashes to derive a recipe's schema fingerprint. `JSON.stringify`
// on the key guards against a field name that happens to contain the `:`/`,`/`{`/`}` separators used here
// colliding with a differently-shaped blueprint.
function canonicalizeBlueprint(
	blueprint: RecipeBlueprint | SimpleDataType | [RecipeBlueprint | SimpleDataType],
): string {
	if (typeof blueprint === 'number') {
		return `p${blueprint}`;
	}

	if (Array.isArray(blueprint)) {
		return `a(${canonicalizeBlueprint(blueprint[0])})`;
	}

	const fields = Object.entries(blueprint)
		.map(([key, dataType]) => `${JSON.stringify(key)}:${canonicalizeBlueprint(dataType)}`)
		.join(',');
	return `o{${fields}}`;
}

function computeSchemaFingerprint(
	blueprint: RecipeBlueprint | SimpleDataType | [RecipeBlueprint | SimpleDataType],
): number {
	return fnv1a32(canonicalizeBlueprint(blueprint));
}

function writeArbitraryPrimitive(dataType: SimpleDataType, writer: Writer, value: any): void {
	switch (dataType) {
		case DataType.Bool: {
			writer.bool(value);
			break;
		}

		case DataType.I8: {
			writer.i8(value);
			break;
		}

		case DataType.U8: {
			writer.u8(value);
			break;
		}

		case DataType.I16: {
			writer.i16(value);
			break;
		}

		case DataType.U16: {
			writer.u16(value);
			break;
		}

		case DataType.I32: {
			writer.i32(value);
			break;
		}

		case DataType.U32: {
			writer.u32(value);
			break;
		}

		case DataType.U64: {
			writer.u64(value);
			break;
		}

		case DataType.String: {
			writer.string(value);
			break;
		}

		case DataType.Date: {
			writer.date(value);
			break;
		}
	}
}

function readArbitraryPrimitive(dataType: SimpleDataType, reader: Reader): any {
	switch (dataType) {
		case DataType.Bool: {
			return reader.bool();
		}

		case DataType.I8: {
			return reader.i8();
		}

		case DataType.U8: {
			return reader.u8();
		}

		case DataType.I16: {
			return reader.i16();
		}

		case DataType.U16: {
			return reader.u16();
		}

		case DataType.I32: {
			return reader.i32();
		}

		case DataType.U32: {
			return reader.u32();
		}

		case DataType.U64: {
			return reader.u64();
		}

		case DataType.String: {
			return reader.string();
		}

		case DataType.Date: {
			return reader.date();
		}
	}
}

export function createRecipe<TBlueprint extends RecipeBlueprint | SimpleDataType | [RecipeBlueprint | SimpleDataType]>(
	blueprint: TBlueprint,
	options: CreateRecipeOptions = {},
): Recipe<RecipeBlueprintToData<TBlueprint>> {
	const { prealloc = 0, versioned = false } = options;
	const fingerprint = versioned ? computeSchemaFingerprint(blueprint) : undefined;

	// Obviously there's 0 validation for any of the writes in this function. The types from its callsite
	// (createRecipe(blueprint)->encode(data)) are supposed to offer safety, which enforces that `data[key]` matches
	// what was provided in `blueprint[key]`. This is effectively enough. Unless the user bypasses a compiler error, there
	// should never be any UB. We'd need crazy casts and type redundancy to make this completely correct.
	function encodeRecursive(
		data: any,
		blueprint: RecipeBlueprint | SimpleDataType | [RecipeBlueprint | SimpleDataType],
		writer = new Writer(prealloc),
	): Buffer {
		if (typeof blueprint === 'number') {
			writeArbitraryPrimitive(blueprint, writer, data);
			return writer.dump();
		}

		if (Array.isArray(blueprint)) {
			writer.array(data, (writer, value) => encodeRecursive(value, blueprint[0], writer));
			return writer.dump();
		}

		for (const [key, dataType] of Object.entries(blueprint)) {
			// Primitives
			if (typeof dataType === 'number') {
				writeArbitraryPrimitive(dataType, writer, data[key]);
			} else if (Array.isArray(dataType)) {
				writer.array(data[key], (writer, value) => encodeRecursive(value, dataType[0], writer));
			} else {
				writer.object(data[key], (writer, value) => encodeRecursive(value, dataType, writer));
			}
		}

		return writer.dump();
	}

	function decodeRecursive(
		reader: Reader,
		blueprint: RecipeBlueprint | SimpleDataType | [RecipeBlueprint | SimpleDataType],
	): any {
		if (typeof blueprint === 'number') {
			return readArbitraryPrimitive(blueprint, reader);
		}

		if (Array.isArray(blueprint)) {
			return reader.array((reader) => decodeRecursive(reader, blueprint[0]));
		}

		const data: any = {};

		for (const [key, dataType] of Object.entries(blueprint)) {
			// Primitives
			if (typeof dataType === 'number') {
				data[key] = readArbitraryPrimitive(dataType, reader);
			} else if (Array.isArray(dataType)) {
				data[key] = reader.array((reader) => decodeRecursive(reader, dataType[0]));
			} else {
				data[key] = reader.object((reader) => decodeRecursive(reader, dataType));
			}
		}

		return data;
	}

	return {
		encode(data: RecipeBlueprintToData<TBlueprint>): Buffer {
			const writer = new Writer(prealloc);
			if (fingerprint !== undefined) {
				writer.u32(fingerprint);
			}

			return encodeRecursive(data, blueprint, writer);
		},
		decode(buffer: Buffer): RecipeBlueprintToData<TBlueprint> {
			const reader = new Reader(buffer);
			if (fingerprint !== undefined) {
				const actualFingerprint = reader.u32();
				if (actualFingerprint !== fingerprint) {
					throw new RecipeSchemaMismatchError(fingerprint, actualFingerprint);
				}
			}

			return decodeRecursive(reader, blueprint);
		},
	};
}
