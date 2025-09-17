#!/usr/bin/env node
import { Command } from 'commander';
import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { runTsc } from '@junction-agents/diagnostics';
import { isRepo, ensureClean, checkoutNewBranch, currentBranch, commitAll, tag, checkoutBranch } from './git.js';
import { editImportRename, removeJsxPropExact, convertRouteComponentToElement, applyChanges, type FileChange, renameJsxTag } from '@junction-agents/tools-ts';
import { RuleRegistry, simpleRule } from '@junction-agents/rules';
import { agentPlan, agentRunOnce, agentPlanLlm, agentRunOnceLlm } from '@junction-agents/core';
import { applyPlan, writeRunRecord } from '@junction-agents/core';
import { planWithLlm } from '@junction-agents/core';

function run(cmd: string, args: string[], cwd: string) {
	const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
	if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed with code ${r.status}`);
}

function readPkg(projectRoot: string) {
	const p = path.join(projectRoot, 'package.json');
	return { path: p, json: JSON.parse(fs.readFileSync(p, 'utf8')) } as { path: string; json: any };
}

function writePkg(pkgPath: string, json: any) {
	fs.writeFileSync(pkgPath, JSON.stringify(json, null, 2) + '\n');
}

function listTsxFiles(dir: string): string[] {
	const out: string[] = [];
	const stack = [dir];
	while (stack.length) {
		const d = stack.pop()!;
		for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
			if (entry.name.startsWith('.')) continue;
			const p = path.join(d, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build' || entry.name === 'coverage') continue;
				stack.push(p);
			} else if (entry.isFile() && (p.endsWith('.tsx') || p.endsWith('.ts'))) {
				out.push(p);
			}
		}
	}
	return out;
}

const program = new Command();
program
	.name('router-fix')
	.description('React Router v5→v6 migration assistant (diagnose/plan/apply)')
	.version('0.1.0');

program
	.command('diagnose')
	.option('-p, --project <path>', 'Project path to run tsc in', process.cwd())
	.action((opts) => {
		const projectRoot = path.resolve(opts.project);
		console.log(`Running tsc in ${projectRoot}...`);
		const res = runTsc(projectRoot);
		console.log(`Diagnostics: ${res.count}`);
		if (res.count) {
			const byCode = new Map<number, number>();
			for (const d of res.diagnostics) byCode.set(d.code, (byCode.get(d.code) ?? 0) + 1);
			console.log('By code:');
			for (const [code, count] of Array.from(byCode.entries()).sort((a, b) => b[1] - a[1])) {
				console.log(`  ${code}: ${count}`);
			}
		}
	});

program
	.command('git:prep')
	.description('Create/switch to upgrade branch and tag current state')
	.option('-p, --project <path>', 'Project path', process.cwd())
	.option('-b, --branch <name>', 'Branch name', 'upgrade/router-v6')
	.option('--tag <name>', 'Optional tag to create before switching')
	.action((opts) => {
		const projectRoot = path.resolve(opts.project);
		if (!isRepo(projectRoot)) throw new Error('Not a git repository');
		ensureClean(projectRoot);
		if (opts.tag) {
			console.log(`Tagging current HEAD as ${opts.tag}`);
			tag(projectRoot, opts.tag, 'Pre-upgrade snapshot');
		}
		console.log(`Creating and checking out ${opts.branch} ...`);
		checkoutNewBranch(projectRoot, opts.branch);
		console.log('Done.');
	});

program
	.command('deps:upgrade')
	.description('Upgrade router deps using pnpm + npm-check-updates and remove v5-only types')
	.option('-p, --project <path>', 'Project path', process.cwd())
	.option('--install', 'Run pnpm install after update', false)
	.option('--dry', 'Dry-run ncu (no -u)', false)
	.option('--git', 'Commit changes after upgrade', false)
	.action((opts) => {
		const projectRoot = path.resolve(opts.project);
		console.log(`Upgrading router deps in ${projectRoot} ...`);

		const ncuArgs = ['dlx', 'npm-check-updates', '-t', 'latest', '-f', 'react-router-dom'];
		if (!opts.dry) ncuArgs.push('-u');
		run('pnpm', ncuArgs, projectRoot);

		// Clean up v5-only type packages
		const { path: pkgPath, json } = readPkg(projectRoot);
		json.devDependencies = json.devDependencies || {};
		const removed: string[] = [];
		for (const name of ['@types/react-router-dom', '@types/history']) {
			if (json.devDependencies[name]) {
				delete json.devDependencies[name];
				removed.push(name);
			}
		}
		if (removed.length) {
			writePkg(pkgPath, json);
			console.log(`Removed v5 types: ${removed.join(', ')}`);
		}

		if (opts.install) {
			console.log('Installing dependencies with pnpm...');
			run('pnpm', ['install'], projectRoot);
		}

		if (opts.git && isRepo(projectRoot)) {
			try {
				commitAll(projectRoot, 'deps: upgrade react-router-dom (via router-fix)');
				console.log(`Committed on branch ${currentBranch(projectRoot)}`);
			} catch (e) {
				console.warn('Git commit skipped:', (e as Error).message);
			}
		}
		console.log('Done.');
	});

program
	.command('deps:reset')
	.description('Reset router deps to v5 line and restore v5 type packages')
	.option('-p, --project <path>', 'Project path', process.cwd())
	.option('--install', 'Run pnpm install after update', false)
	.option('--git', 'Commit changes after reset', false)
	.action((opts) => {
		const projectRoot = path.resolve(opts.project);
		const { path: pkgPath, json } = readPkg(projectRoot);
		json.dependencies = json.dependencies || {};
		json.devDependencies = json.devDependencies || {};
		json.dependencies['react-router-dom'] = '^5.3.4';
		json.devDependencies['@types/react-router-dom'] = '^5.3.3';
		json.devDependencies['@types/history'] = '^4.7.11';
		writePkg(pkgPath, json);
		console.log('Set react-router-dom to ^5.3.4 and restored v5 types.');
		if (opts.install) {
			console.log('Installing dependencies with pnpm...');
			run('pnpm', ['install'], projectRoot);
		}
		if (opts.git && isRepo(projectRoot)) {
			try {
				commitAll(projectRoot, 'deps: reset react-router-dom to v5 (via router-fix)');
				console.log(`Committed on branch ${currentBranch(projectRoot)}`);
			} catch (e) {
				console.warn('Git commit skipped:', (e as Error).message);
			}
		}
		console.log('Done.');
	});

program
	.command('plan')
	.option('-p, --project <path>', 'Project path', process.cwd())
	.option('--planner <type>', 'llm|rules', 'llm')
	.option('--provider <name>', 'openai|anthropic', 'openai')
	.option('--model <name>', 'Model name', 'gpt-4o-mini')
	.description('Plan migration ops (default LLM)')
	.action(async (opts) => {
		const projectRoot = path.resolve(opts.project);
		if (opts.planner === 'rules') {
			const registry = new RuleRegistry();
			registry.register(simpleRule);
			const plan = agentPlan({ projectRoot }, registry);
			console.log(`Proposed ops: ${plan.ops.length}`);
			console.log(`Target codes: ${plan.targetCodes.join(', ')}`);
		} else {
			const plan = await agentPlanLlm({ projectRoot }, { provider: opts.provider, model: opts.model });
			console.log(JSON.stringify(plan, null, 2));
		}
	});

program
	.command('agent:plan-llm')
	.option('-p, --project <path>', 'Project path', process.cwd())
	.option('--provider <name>', 'openai|anthropic', 'openai')
	.option('--model <name>', 'Model name', 'gpt-4o-mini')
	.description('Plan ops using LLM (LangChain)')
	.action(async (opts) => {
		const projectRoot = path.resolve(opts.project);
		const registry = new RuleRegistry();
		registry.register(simpleRule);
		const diags = require('@junction-agents/diagnostics').runTsc(projectRoot).diagnostics;
		const files = [] as string[];
		const plan = await planWithLlm(diags, files, { provider: opts.provider, model: opts.model });
		console.log(JSON.stringify(plan, null, 2));
	});


program
	.command('run')
	.description('Run iterative plan/apply cycles until budget exhausted or stable')
	.option('-p, --project <path>', 'Project path', process.cwd())
	.option('--planner <type>', 'llm|rules', 'llm')
	.option('--provider <name>', 'openai|anthropic', 'openai')
	.option('--model <name>', 'Model name', 'gpt-4o-mini')
	.option('--max-steps <n>', 'Maximum cycles', '5')
	.option('--debug', 'Write plan/changes artifacts under .upgrade/runs', false)
	.action(async (opts) => {
		const projectRoot = path.resolve(opts.project);
		const maxSteps = Math.max(1, parseInt(String(opts.maxSteps), 10) || 1);
		let steps = 0;
		let lastCount = Number.POSITIVE_INFINITY;
		while (steps < maxSteps) {
			steps++;
			let res;
			const sessionId = opts.debug ? `${Date.now()}-${steps}` : undefined;
			if (opts.planner === 'rules') {
				const registry = new RuleRegistry();
				registry.register(simpleRule);
				res = agentRunOnce({ projectRoot }, registry, (plan) => applyPlan(plan), sessionId);
			} else {
				res = await agentRunOnceLlm({ projectRoot }, { provider: opts.provider, model: opts.model }, (plan) => applyPlan(plan), sessionId);
			}
			console.log(`Step ${steps}: Applied=${res.applied} Before=${res.before.count}${res.after ? ` After=${res.after.count}` : ''}`);
			writeRunRecord(projectRoot, { sessionId: String(Date.now()), timestamp: new Date().toISOString(), before: res.before, after: res.after, filesTouched: 0 });
			if (!res.after || res.after.count >= res.before.count) break;
			if (res.after.count === lastCount) break; // idempotency/stability guard
			lastCount = res.after.count;
		}
		console.log('Run loop complete.');
	});

program
	.command('apply')
	.option('-p, --project <path>', 'Project path', process.cwd())
	.option('--planner <type>', 'llm|rules', 'llm')
	.option('--provider <name>', 'openai|anthropic', 'openai')
	.option('--model <name>', 'Model name', 'gpt-4o-mini')
	.option('--git', 'Commit after apply', false)
	.option('--debug', 'Write plan/changes artifacts under .upgrade/runs', false)
	.description('Plan+apply one cycle (default LLM)')
	.action(async (opts) => {
		const projectRoot = path.resolve(opts.project);
		let res;
		const sessionId = opts.debug ? String(Date.now()) : undefined;
		if (opts.planner === 'rules') {
			const registry = new RuleRegistry();
			registry.register(simpleRule);
			res = agentRunOnce({ projectRoot }, registry, (plan) => applyPlan(plan), sessionId);
		} else {
			res = await agentRunOnceLlm({ projectRoot }, { provider: opts.provider, model: opts.model }, (plan) => applyPlan(plan), sessionId);
		}
		console.log(`Applied: ${res.applied}. Before: ${res.before.count}${res.after ? ` After: ${res.after.count}` : ''}`);
		writeRunRecord(projectRoot, { sessionId: String(Date.now()), timestamp: new Date().toISOString(), before: res.before, after: res.after, filesTouched: 0 });
		if (opts.git && isRepo(projectRoot)) {
			try {
				commitAll(projectRoot, 'router-fix: apply agent batch');
				console.log(`Committed on branch ${currentBranch(projectRoot)}`);
			} catch (e) {
				console.warn('Git commit skipped:', (e as Error).message);
			}
		}
		console.log('Done.');
	});

program.parseAsync();
