import type { Buffer } from 'node:buffer';
import { DataType, type SimpleDataType, type SimpleDataTypeToPrimitiveMap } from '../Data';
import { Reader } from '../Reader';
import { Writer } from '../Writer';

export interface RecipeBlueprint {
	[K: string]: RecipeBlueprint | SimpleDataType | [RecipeBlueprint | SimpleDataType];
}

export type RecipeBlueprintToData<TBlueprint extends RecipeBlueprint | SimpleDataType> =
	TBlueprint extends SimpleDataType
		? SimpleDataTypeToPrimitiveMap[TBlueprint]
		: {
				[K in keyof TBlueprint]: TBlueprint[K] extends SimpleDataType
					? SimpleDataTypeToPrimitiveMap[TBlueprint[K]]
					: TBlueprint[K] extends RecipeBlueprint
					? RecipeBlueprintToData<TBlueprint[K]>
					: TBlueprint[K] extends [RecipeBlueprint | SimpleDataType]
					? RecipeBlueprintToData<TBlueprint[K][0]>[]
					: never;
		  };

export interface Recipe<TData> {
	decode(buffer: Buffer): TData;
	encode(data: TData): Buffer;
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

export function createRecipe<TBlueprint extends RecipeBlueprint | SimpleDataType>(
	blueprint: TBlueprint,
	prealloc: number = 0,
): Recipe<RecipeBlueprintToData<TBlueprint>> {
	// Obviously there's 0 validation for any of the writes in this function. The types from its callsite
	// (createRecipe(blueprint)->encode(data)) are supposed to offer safety, which enforces that `data[key]` matches
	// what was provided in `blueprint[key]`. This is effectively enough. Unless the user bypasses a compiler error, there
	// should never be any UB. We'd need crazy casts and type redundancy to make this completely correct.
	function encodeRecursive(
		data: any,
		blueprint: RecipeBlueprint | SimpleDataType,
		writer = new Writer(prealloc),
	): Buffer {
		if (typeof blueprint === 'number') {
			writeArbitraryPrimitive(blueprint, writer, data);
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

	function decodeRecursive(reader: Reader, blueprint: RecipeBlueprint | SimpleDataType): any {
		if (typeof blueprint === 'number') {
			return readArbitraryPrimitive(blueprint, reader);
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
			return encodeRecursive(data, blueprint);
		},
		decode(buffer: Buffer): RecipeBlueprintToData<TBlueprint> {
			return decodeRecursive(new Reader(buffer), blueprint);
		},
	};
}
