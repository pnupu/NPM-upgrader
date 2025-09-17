import { spawnSync } from 'node:child_process';
import path from 'node:path';
import ts from 'typescript';
import type { Diagnostic as SharedDiagnostic, Span } from '@junction-agents/shared';

export interface RunTscResult {
	diagnostics: SharedDiagnostic[];
	count: number;
}

export function runTsc(projectRoot: string, extraArgs: string[] = []): RunTscResult {
	const tscBin = path.join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
	const args = ['--noEmit', '--pretty', 'false', ...extraArgs];
	const proc = spawnSync(tscBin, args, { cwd: projectRoot, encoding: 'utf8' });

	if (proc.error) {
		throw proc.error;
	}

	// If exit code 0, no errors
	if (proc.status === 0) {
		return { diagnostics: [], count: 0 };
	}

	// Fallback: use TS API to create a program and collect diagnostics
	const configPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, 'tsconfig.json');
	if (!configPath) {
		throw new Error('tsconfig.json not found in ' + projectRoot);
	}
	const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
	const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
	const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
	const all = [
		...program.getSyntacticDiagnostics(),
		...program.getSemanticDiagnostics(),
		...program.getOptionsDiagnostics(),
	];

	const diags: SharedDiagnostic[] = all.map((d) => toSharedDiagnostic(d, program));
	return { diagnostics: diags, count: diags.length };
}

function toSharedDiagnostic(d: ts.Diagnostic, program: ts.Program): SharedDiagnostic {
	let file = d.file?.fileName ?? 'unknown';
	let start = 0;
	let end = 0;
	if (d.file && typeof d.start === 'number' && typeof d.length === 'number') {
		start = d.start;
		end = d.start + d.length;
	}
	const span: Span = { start, end };
	return {
		code: d.code,
		message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
		file,
		span,
	};
}
