export enum DataType {
	// Special/internal
	Null,

	// Simple/primitive
	Bool,
	I8,
	U8,
	I16,
	U16,
	I32,
	U32,
	U64,
	String,
	Date,

	// Complex/structured
	Array,
	Object,
}

export type SimpleDataType = Exclude<DataType, DataType.Array | DataType.Null | DataType.Object>;

export interface SimpleDataTypeToPrimitiveMap {
	[DataType.Bool]: boolean | null;
	[DataType.I8]: number | null;
	[DataType.U8]: number | null;
	[DataType.I16]: number | null;
	[DataType.U16]: number | null;
	[DataType.I32]: number | null;
	[DataType.U32]: number | null;
	[DataType.U64]: bigint | null;
	[DataType.String]: string | null;
	[DataType.Date]: number | null;
}
