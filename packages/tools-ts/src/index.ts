import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { Op } from '@junction-agents/shared';
export * from './schemas.js';

export type FileChange = { file: string; before: string; after: string };

export function applyChanges(changes: FileChange[]): void {
	for (const c of changes) {
		const current = fs.readFileSync(c.file, 'utf8');
		if (current !== c.before) {
			throw new Error(`Preimage mismatch for ${c.file}`);
		}
		fs.writeFileSync(c.file, c.after, 'utf8');
	}
}

export function renameJsxTag(content: string, fromName: string, toName: string): string {
	const source = ts.createSourceFile('f.tsx', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
	const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
		const visit: ts.Visitor = (node) => {
			if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxClosingElement(node)) {
				const name = node.tagName.getText(source);
				if (name === fromName) {
					const newName = ts.factory.createIdentifier(toName);
					if (ts.isJsxOpeningElement(node)) return ts.factory.updateJsxOpeningElement(node, newName, node.typeArguments, node.attributes);
					if (ts.isJsxSelfClosingElement(node)) return ts.factory.updateJsxSelfClosingElement(node, newName, node.typeArguments, node.attributes);
					if (ts.isJsxClosingElement(node)) return ts.factory.updateJsxClosingElement(node, newName);
				}
			}
			return ts.visitEachChild(node, visit, context);
		};
		return (sf) => ts.visitEachChild(sf, visit, context) as ts.SourceFile;
	};
	const result = ts.transform(source, [transformer]);
	const updated = result.transformed[0] as ts.SourceFile;
	result.dispose();
	return printer.printFile(updated);
}

export function removeJsxProp(content: string, tagName: string, propName: string): string {
	const source = ts.createSourceFile('f.tsx', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
	const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
		const visit: ts.Visitor = (node) => {
			if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
				const tag = node.tagName.getText(source);
				if (tag === tagName) {
					const props = node.attributes.properties.filter((p) => {
						return !(ts.isJsxAttribute(p) && p.name.getText(source) === propName);
					});
					if (ts.isJsxSelfClosingElement(node)) {
						return ts.factory.updateJsxSelfClosingElement(node, node.tagName, node.typeArguments, ts.factory.updateJsxAttributes(node.attributes, props));
					} else {
						return ts.factory.updateJsxOpeningElement(node, node.tagName, node.typeArguments, ts.factory.updateJsxAttributes(node.attributes, props));
					}
				}
			}
			return ts.visitEachChild(node, visit, context);
		};
		return (sf) => ts.visitEachChild(sf, visit, context) as ts.SourceFile;
	};
	const result = ts.transform(source, [transformer]);
	const updated = result.transformed[0] as ts.SourceFile;
	result.dispose();
	return printer.printFile(updated);
}

export function editImportRename(content: string, moduleName: string, fromName: string, toName: string): string {
	const source = ts.createSourceFile('f.tsx', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
	const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
		const visit: ts.Visitor = (node) => {
			if (ts.isImportDeclaration(node)) {
				const spec = node.importClause?.namedBindings;
				const moduleText = (node.moduleSpecifier as ts.StringLiteral).text;
				if (moduleText === moduleName && spec && ts.isNamedImports(spec)) {
					const elements = spec.elements.map((el) => {
						const localName = el.name.text;
						const importedName = el.propertyName?.text ?? localName;
						if (importedName === fromName) {
							// Preserve alias if present
							if (el.propertyName) {
								return ts.factory.createImportSpecifier(false, ts.factory.createIdentifier(toName), el.name);
							}
							return ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier(toName));
						}
						return el;
					});
					return ts.factory.updateImportDeclaration(
						node,
						node.modifiers,
						ts.factory.updateImportClause(
							node.importClause!,
							node.importClause!.isTypeOnly,
							node.importClause!.name,
							ts.factory.updateNamedImports(spec, elements)
						),
						node.moduleSpecifier,
						node.assertClause
					);
				}
			}
			return ts.visitEachChild(node, visit, context);
		};
		return (sf) => ts.visitEachChild(sf, visit, context) as ts.SourceFile;
	};
	const result = ts.transform(source, [transformer]);
	const updated = result.transformed[0] as ts.SourceFile;
	result.dispose();
	return printer.printFile(updated);
}

export function removeJsxPropExact(content: string): string {
	return removeJsxProp(content, 'Route', 'exact');
}

export function convertRouteComponentToElement(content: string): string {
	return convertJsxPropComponentToElement(content, 'Route', 'component', 'element');
}

export function convertJsxPropComponentToElement(content: string, tagName: string, fromPropName: string, toPropName: string): string {
	const source = ts.createSourceFile('f.tsx', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
	const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
		const visit: ts.Visitor = (node) => {
			if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
				const tag = node.tagName.getText(source);
				if (tag === tagName) {
					const attrs = node.attributes.properties;
					for (let i = 0; i < attrs.length; i++) {
						const p = attrs[i];
						if (
							ts.isJsxAttribute(p) &&
							p.name.getText(source) === fromPropName &&
							p.initializer &&
							ts.isJsxExpression(p.initializer) &&
							p.initializer.expression
						) {
							const tagExpr = p.initializer.expression;
							if (ts.isIdentifier(tagExpr) || ts.isPropertyAccessExpression(tagExpr)) {
								const jsx = ts.factory.createJsxSelfClosingElement(tagExpr as ts.JsxTagNameExpression, undefined, ts.factory.createJsxAttributes([]));
								const newProps = attrs.slice();
								newProps.splice(
									i,
									1,
									ts.factory.createJsxAttribute(ts.factory.createIdentifier(toPropName), ts.factory.createJsxExpression(undefined, jsx))
								);
								if (ts.isJsxSelfClosingElement(node)) {
									return ts.factory.updateJsxSelfClosingElement(
										node,
										node.tagName,
										node.typeArguments,
										ts.factory.updateJsxAttributes(node.attributes, newProps)
									);
								} else {
									return ts.factory.updateJsxOpeningElement(
										node,
										node.tagName,
										node.typeArguments,
										ts.factory.updateJsxAttributes(node.attributes, newProps)
									);
								}
							}
						}
					}
				}
			}
			return ts.visitEachChild(node, visit, context);
		};
		return (sf) => ts.visitEachChild(sf, visit, context) as ts.SourceFile;
	};
	const result = ts.transform(source, [transformer]);
	const updated = result.transformed[0] as ts.SourceFile;
	result.dispose();
	return printer.printFile(updated);
}

// Minimal call rewriter to support planner REWRITE_CALL op
export type RewriteEdit = { op: 'RENAME' | 'INSERT_ARG' | 'DROP_ARG' | 'WRAP_ARG'; index?: number; value?: unknown };

export function rewriteCall(content: string, calleeName: string, edits: RewriteEdit[]): string {
    const source = ts.createSourceFile('f.tsx', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
        const visit: ts.Visitor = (node) => {
            if (ts.isCallExpression(node)) {
                let matches = false;
                let renameCalleeTo: string | null = null;
                if (ts.isIdentifier(node.expression)) {
                    matches = node.expression.text === calleeName;
                } else if (ts.isPropertyAccessExpression(node.expression)) {
                    matches = node.expression.name.text === calleeName;
                }
                if (matches) {
                    let newExpr = node.expression;
                    let args = node.arguments.slice();
                    for (const e of edits) {
                        switch (e.op) {
                            case 'RENAME': {
                                if (typeof e.value === 'string' && e.value.trim().length) {
                                    if (ts.isIdentifier(newExpr)) {
                                        newExpr = ts.factory.createIdentifier(e.value);
                                    } else if (ts.isPropertyAccessExpression(newExpr)) {
                                        newExpr = ts.factory.updatePropertyAccessExpression(newExpr, newExpr.expression, ts.factory.createIdentifier(e.value));
                                    }
                                }
                                break;
                            }
                            case 'INSERT_ARG': {
                                const idx = Math.max(0, Math.min(args.length, e.index ?? args.length));
                                args = args.slice(0, idx).concat([literalFromValue(e.value)]).concat(args.slice(idx));
                                break;
                            }
                            case 'DROP_ARG': {
                                const idx = e.index ?? -1;
                                if (idx >= 0 && idx < args.length) {
                                    args = args.slice(0, idx).concat(args.slice(idx + 1));
                                }
                                break;
                            }
                            case 'WRAP_ARG': {
                                const idx = e.index ?? -1;
                                if (idx >= 0 && idx < args.length && typeof e.value === 'string' && e.value.trim().length) {
                                    args = args.slice();
                                    args[idx] = ts.factory.createCallExpression(ts.factory.createIdentifier(String(e.value)), undefined, [args[idx]]);
                                }
                                break;
                            }
                        }
                    }
                    return ts.factory.updateCallExpression(node, newExpr, node.typeArguments, args);
                }
            }
            return ts.visitEachChild(node, visit, context);
        };
        return (sf) => ts.visitEachChild(sf, visit, context) as ts.SourceFile;
    };
    const result = ts.transform(source, [transformer]);
    const updated = result.transformed[0] as ts.SourceFile;
    result.dispose();
    return printer.printFile(updated);
}

function literalFromValue(value: unknown): ts.Expression {
    if (value === null) return ts.factory.createNull();
    const t = typeof value;
    if (t === 'string') return ts.factory.createStringLiteral(String(value));
    if (t === 'number') return ts.factory.createNumericLiteral(String(value));
    if (t === 'boolean') return value ? ts.factory.createTrue() : ts.factory.createFalse();
    if (Array.isArray(value)) {
        return ts.factory.createArrayLiteralExpression(value.map(literalFromValue), false);
    }
    if (t === 'object') {
        const props: ts.PropertyAssignment[] = [];
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            const isValidId = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k);
            const name = isValidId ? ts.factory.createIdentifier(k) : ts.factory.createStringLiteral(k);
            props.push(ts.factory.createPropertyAssignment(name as any, literalFromValue(v)));
        }
        return ts.factory.createObjectLiteralExpression(props, false);
    }
    // fallback to undefined identifier if unsupported
    return ts.factory.createIdentifier('undefined');
}

// Very lightweight formatter/organizer: re-print the file via TS printer
export function formatAndOrganize(content: string): string {
    const source = ts.createSourceFile('f.tsx', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    return printer.printFile(source);
}
