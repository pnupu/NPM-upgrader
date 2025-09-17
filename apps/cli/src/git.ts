import { spawnSync } from 'node:child_process';

function runGit(args: string[], cwd: string) {
	const r = spawnSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' });
	if (r.status !== 0) {
		const msg = r.stderr || r.stdout || `git ${args.join(' ')} failed with code ${r.status}`;
		throw new Error(msg.trim());
	}
	return r.stdout.trim();
}

export function isRepo(cwd: string): boolean {
	const r = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, stdio: 'pipe', encoding: 'utf8' });
	return r.status === 0 && r.stdout.trim() === 'true';
}

export function currentBranch(cwd: string): string {
	return runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
}

export function ensureClean(cwd: string): void {
	const status = runGit(['status', '--porcelain'], cwd);
	if (status) throw new Error('Working tree not clean. Commit or stash changes first.');
}

export function checkoutNewBranch(cwd: string, branch: string): void {
	runGit(['checkout', '-b', branch], cwd);
}

export function checkoutBranch(cwd: string, branch: string): void {
	runGit(['checkout', branch], cwd);
}

export function commitAll(cwd: string, message: string): void {
	runGit(['add', '-A'], cwd);
	runGit(['commit', '-m', message], cwd);
}

export function tag(cwd: string, tagName: string, message?: string): void {
	const args = message ? ['tag', '-a', tagName, '-m', message] : ['tag', tagName];
	runGit(args, cwd);
}

export function stashAll(cwd: string): void {
	runGit(['stash', 'push', '-u', '-m', 'router-fix auto-stash'], cwd);
}

export function restoreLastStash(cwd: string): void {
	runGit(['stash', 'pop'], cwd);
}
