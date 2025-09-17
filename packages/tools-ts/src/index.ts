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
