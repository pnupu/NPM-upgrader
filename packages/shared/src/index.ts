export interface Span { start: number; end: number }

export interface Diagnostic {
	code: number;
	message: string;
	file: string;
	span: Span;
	related?: Array<{ file: string; span: Span; message: string }>;
	symbol?: SymbolRef;
	moduleName?: string;
}

export interface SymbolRef {
	name: string;
	file?: string;
}

export type Op =
	| { kind: 'EDIT_IMPORT'; file: string; from: ImportSpec; to: ImportSpec }
	| { kind: 'EDIT_JSX_PROP'; file: string; component: string; prop: string; op: 'RENAME' | 'DELETE' | 'INSERT'; value?: unknown; match?: { importFrom?: string } }
	| { kind: 'RENAME_JSX_TAG'; file: string; from: string; to: string }
	| { kind: 'REMOVE_JSX_PROP'; file: string; tag: string; prop: string }
	| { kind: 'CONVERT_COMPONENT_PROP_TO_ELEMENT'; file: string; tag: string; fromProp: string; toProp: string }
	| { kind: 'REWRITE_CALL'; file: string; callee: CalleeSpec; edits: CallEdit[] }
	| { kind: 'ADD_FILE'; path: string; templateId: string; params?: Record<string, unknown> }
	| { kind: 'FORMAT_AND_ORGANIZE'; files: string[] };

export interface ImportSpec {
	module: string;
	named?: string;
	alias?: string;
}

export interface CalleeSpec {
	name: string;
	importFrom?: string;
}

export interface CallEdit {
	op: 'RENAME' | 'INSERT_ARG' | 'DROP_ARG' | 'WRAP_ARG';
	index?: number;
	value?: unknown;
}

export interface Plan {
	targetCodes: number[];
	ops: Op[];
	why: string[];
	confidence: number;
}
