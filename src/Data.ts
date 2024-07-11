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
	[DataType.Bool]: boolean;
	[DataType.I8]: number;
	[DataType.U8]: number;
	[DataType.I16]: number;
	[DataType.U16]: number;
	[DataType.I32]: number;
	[DataType.U32]: number;
	[DataType.U64]: bigint;
	[DataType.String]: string;
	[DataType.Date]: number;
}
