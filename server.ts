import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as git from 'isomorphic-git';
import type { Request, Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 4173;
const DEFAULT_REPO = process.env.GIT_DASHBOARD_REPO || __dirname;
const execFileAsync = promisify(execFile);
const GIT_BIN = process.env.GIT_BIN || '/usr/bin/git';
const MAX_COMMIT_ROWS = 100;
const RECENT_COMMIT_ROWS = 25;
const DIST_DIR = path.join(__dirname, 'dist');
const VERSION_FILES = [
  path.join(__dirname, 'src', 'App.tsx'),
  path.join(__dirname, 'src', 'main.tsx'),
  path.join(__dirname, 'src', 'styles.css')
];

type FileStat = { additions: number; deletions: number };
type FileRow = { file: string; additions: number; deletions: number };
type UntrackedRow = { file: string };
type CommitRow = {
  oid: string;
  message: string;
  ts: number;
  additions: number;
  deletions: number;
  files: FileRow[];
};
type DashboardState = { trackedPending: string[] };

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
}
app.use(express.json());

function resolveTarget(req: Request): string {
  const repo = typeof req.query.repo === 'string'
    ? req.query.repo
    : typeof req.body?.repo === 'string'
      ? req.body.repo
      : null;
  return repo ? path.resolve(repo) : DEFAULT_REPO;
}

function stateFileForRepo(dir: string): string {
  const gitDir = path.join(dir, '.git');
  if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
    return path.join(gitDir, 'git-delta-dashboard-state.json');
  }
  return path.join(dir, '.git-delta-dashboard-state.json');
}

function readDashboardState(dir: string): DashboardState {
  try {
    const file = stateFileForRepo(dir);
    if (!fs.existsSync(file)) return { trackedPending: [] };
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as DashboardState;
    return { trackedPending: Array.isArray(parsed.trackedPending) ? parsed.trackedPending.filter((x) => typeof x === 'string') : [] };
  } catch {
    return { trackedPending: [] };
  }
}

function writeDashboardState(dir: string, state: DashboardState): void {
  try {
    fs.writeFileSync(stateFileForRepo(dir), JSON.stringify(state, null, 2));
  } catch {}
}

function upsertTrackedPending(dir: string, files: string[]): void {
  if (!files.length) return;
  const state = readDashboardState(dir);
  const set = new Set(state.trackedPending);
  for (const file of files) set.add(file);
  writeDashboardState(dir, { trackedPending: Array.from(set).sort() });
}

function removeTrackedPending(dir: string, files: string[]): void {
  if (!files.length) return;
  const state = readDashboardState(dir);
  const drop = new Set(files);
  const next = state.trackedPending.filter((f) => !drop.has(f));
  writeDashboardState(dir, { trackedPending: next });
}

function pruneTrackedPending(dir: string, matrix: Array<[string, number, number, number]>): string[] {
  const state = readDashboardState(dir);
  const keep = state.trackedPending.filter((file) => {
    const row = matrix.find(([f]) => f === file);
    if (!row) return false;
    const [, head, workdir, stage] = row;
    return head === 0 && (workdir !== 0 || stage !== 0);
  });
  if (keep.length !== state.trackedPending.length) writeDashboardState(dir, { trackedPending: keep });
  return keep;
}

async function runGitCommand(dir: string, args: string[]): Promise<void> {
  try {
    await execFileAsync(GIT_BIN, args, { cwd: dir });
  } catch {
    await execFileAsync('git', args, { cwd: dir });
  }
}

async function safeCurrentBranch(dir: string): Promise<string> {
  try {
    return await git.currentBranch({ fs, dir, fullname: false }) || '(detached)';
  } catch {
    return '(unknown)';
  }
}

async function listStateFiles(dir: string): Promise<{ staged: FileRow[]; modified: FileRow[]; untracked: UntrackedRow[] }> {
  const matrix = await git.statusMatrix({ fs, dir });
  const staged = [];
  const modified = [];
  const untracked = [];

  for (const [file, head, workdir, stage] of matrix) {
    const isUntracked = head === 0 && stage === 0 && workdir !== 0;
    const isStaged = stage !== head;
    const isModified = head !== 0 && workdir !== stage;

    if (isUntracked) {
      const ignored = await git.isIgnored({ fs, dir, filepath: file });
      if (ignored) continue;
      untracked.push({ file });
    }
    if (isStaged) {
      staged.push({ file, additions: 0, deletions: 0 });
    }
    if (isModified) {
      modified.push({ file, additions: 0, deletions: 0 });
    }
  }

  return { staged, modified, untracked };
}

function parseNumstat(raw: string): Map<string, FileStat> {
  const stats = new Map<string, FileStat>();
  const lines = raw.split('\n').filter(Boolean);
  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const additions = Number.isFinite(Number(parts[0])) ? Number(parts[0]) : 0;
    const deletions = Number.isFinite(Number(parts[1])) ? Number(parts[1]) : 0;
    const file = parts[2];
    stats.set(file, { additions, deletions });
  }
  return stats;
}

async function getDiffNumstatMap(dir: string, args: string[]): Promise<Map<string, FileStat>> {
  try {
    const { stdout } = await execFileAsync(GIT_BIN, args, { cwd: dir });
    return parseNumstat(stdout);
  } catch (error) {
    console.error('numstat command failed', { bin: GIT_BIN, args, dir, error: error instanceof Error ? error.message : error });
    try {
      const { stdout } = await execFileAsync('git', args, { cwd: dir });
      return parseNumstat(stdout);
    } catch {
      return new Map();
    }
  }
}

async function getFileDiffStat(dir: string, file: string, cached = false): Promise<FileStat> {
  const args = ['diff'];
  if (cached) args.push('--cached');
  args.push('--numstat', '--', file);
  const statMap = await getDiffNumstatMap(dir, args);
  const direct = statMap.get(file);
  if (direct) return direct;
  for (const [key, value] of statMap.entries()) {
    if (key.endsWith(`/${file}`) || key === `./${file}`) return value;
  }
  return { additions: 0, deletions: 0 };
}

async function populateFileStats(dir: string, rows: FileRow[], cached = false): Promise<void> {
  await Promise.all(
    rows.map(async (row) => {
      const stat = await getFileDiffStat(dir, row.file, cached);
      row.additions = stat.additions;
      row.deletions = stat.deletions;
    })
  );
}

async function readRefOid(dir: string, ref: string): Promise<string | null> {
  try {
    return await git.resolveRef({ fs, dir, ref });
  } catch {
    return null;
  }
}

async function readCommitMap(dir: string, ref: string, depth = 300): Promise<Map<string, { idx: number; commit: any }>> {
  try {
    const commits = await git.log({ fs, dir, ref, depth });
    return new Map(commits.map((c, idx) => [c.oid, { idx, commit: c }]));
  } catch {
    return new Map();
  }
}

async function readCommits(dir: string, ref = 'HEAD', depth = MAX_COMMIT_ROWS): Promise<any[]> {
  try {
    return await git.log({ fs, dir, ref, depth });
  } catch {
    return [];
  }
}

function countUntilBase(map: Map<string, { idx: number; commit: any }>, baseOid: string | null): number {
  if (!baseOid) return 0;
  const base = map.get(baseOid);
  return base ? base.idx : 0;
}

function compactCommit(commit: any): CommitRow {
  return {
    oid: commit.oid,
    message: (commit.commit.message || '').trim() || commit.oid.slice(0, 7),
    ts: commit.commit.committer?.timestamp || 0,
    additions: 0,
    deletions: 0,
    files: []
  };
}

async function getCommitDiffStat(dir: string, oid: string): Promise<{ additions: number; deletions: number; files: FileRow[] }> {
  const statMap = await getDiffNumstatMap(dir, ['show', '--numstat', '--format=', oid]);
  let additions = 0;
  let deletions = 0;
  const files: FileRow[] = [];
  for (const stat of statMap.values()) {
    additions += stat.additions;
    deletions += stat.deletions;
  }
  for (const [file, stat] of statMap.entries()) {
    files.push({ file, additions: stat.additions, deletions: stat.deletions });
  }
  return { additions, deletions, files };
}

async function populateCommitStats(dir: string, commits: CommitRow[]): Promise<void> {
  await Promise.all(
    commits.map(async (commit) => {
      const stat = await getCommitDiffStat(dir, commit.oid);
      commit.additions = stat.additions;
      commit.deletions = stat.deletions;
      commit.files = stat.files;
    })
  );
}

async function getAheadBehind(dir: string, branch: string): Promise<{
  ahead: number;
  behind: number;
  aheadCommits: CommitRow[];
  behindCommits: CommitRow[];
  aheadMode: 'local' | 'upstream';
}> {
  if (!branch || branch === '(detached)' || branch === '(unknown)') {
    return { ahead: 0, behind: 0, aheadCommits: [], behindCommits: [], aheadMode: 'upstream' };
  }

  const localRef = `refs/heads/${branch}`;
  let remoteRef: string | null = null;
  try {
    const remoteName = await git.getConfig({ fs, dir, path: `branch.${branch}.remote` });
    const mergeRef = await git.getConfig({ fs, dir, path: `branch.${branch}.merge` });
    if (remoteName && mergeRef && mergeRef.startsWith('refs/heads/')) {
      remoteRef = `refs/remotes/${remoteName}/${mergeRef.slice('refs/heads/'.length)}`;
    }
  } catch {}
  const localOid = await readRefOid(dir, localRef);
  const remoteCandidates = [
    remoteRef,
    `refs/remotes/origin/${branch}`,
    'refs/remotes/origin/HEAD'
  ].filter((x): x is string => Boolean(x));
  let resolvedRemoteRef: string | null = null;
  let remoteOid: string | null = null;
  for (const candidate of remoteCandidates) {
    const oid = await readRefOid(dir, candidate);
    if (oid) {
      resolvedRemoteRef = candidate;
      remoteOid = oid;
      break;
    }
  }

  if (!localOid || !remoteOid) {
    // No upstream reference available for this branch, so we can't compute true ahead/behind.
    // Keep ahead/behind at zero and rely on recent commits list for history display.
    return { ahead: 0, behind: 0, aheadCommits: [], behindCommits: [], aheadMode: 'local' };
  }

  const [localMap, remoteMap] = await Promise.all([
    readCommitMap(dir, localRef),
    readCommitMap(dir, resolvedRemoteRef as string)
  ]);

  let baseOid = null;
  for (const oid of localMap.keys()) {
    if (remoteMap.has(oid)) {
      baseOid = oid;
      break;
    }
  }

  const ahead = countUntilBase(localMap, baseOid);
  const behind = countUntilBase(remoteMap, baseOid);

  const aheadCommits = Array.from(localMap.values())
    .slice(0, Math.min(ahead, MAX_COMMIT_ROWS))
    .map((v) => compactCommit(v.commit));

  const behindCommits = Array.from(remoteMap.values())
    .slice(0, Math.min(behind, MAX_COMMIT_ROWS))
    .map((v) => compactCommit(v.commit));

  return { ahead, behind, aheadCommits, behindCommits, aheadMode: 'upstream' };
}

async function getRepoState(dir: string): Promise<{
  repository: string;
  branch: string;
  counts: { staged: number; modified: number; untracked: number; ahead: number; behind: number; recent: number };
  meta: { aheadMode: 'local' | 'upstream' };
  details: { staged: FileRow[]; modified: FileRow[]; untracked: UntrackedRow[]; ahead: CommitRow[]; behind: CommitRow[]; recent: CommitRow[] };
}> {
  const repoName = path.basename(dir);
  const branch = await safeCurrentBranch(dir);
  const { staged, modified, untracked } = await listStateFiles(dir);
  const { ahead, behind, aheadCommits, behindCommits, aheadMode } = await getAheadBehind(dir, branch);
  const recentCommits = (await readCommits(dir, 'HEAD', RECENT_COMMIT_ROWS)).map((c) => compactCommit(c));
  await Promise.all([
    populateFileStats(dir, staged, true),
    populateFileStats(dir, modified, false),
    populateCommitStats(dir, aheadCommits),
    populateCommitStats(dir, behindCommits),
    populateCommitStats(dir, recentCommits)
  ]);

  return {
    repository: repoName,
    branch,
    counts: {
      staged: staged.length,
      modified: modified.length,
      untracked: untracked.length,
      ahead,
      behind,
      recent: recentCommits.length
    },
    meta: {
      aheadMode
    },
    details: {
      staged,
      modified,
      untracked,
      ahead: aheadCommits,
      behind: behindCommits,
      recent: recentCommits
    }
  };
}

function getAssetVersion(): string {
  let maxMtimeMs = 0;
  for (const file of VERSION_FILES) {
    try {
      const stat = fs.statSync(file);
      if (stat.mtimeMs > maxMtimeMs) maxMtimeMs = stat.mtimeMs;
    } catch {}
  }
  return String(Math.floor(maxMtimeMs));
}

app.get('/api/version', (_req: Request, res: Response) => {
  res.json({ version: getAssetVersion() });
});

app.get('/api/state', async (req: Request, res: Response) => {
  const target = resolveTarget(req);
  try {
    const state = await getRepoState(target);
    res.json(state);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to read repository state' });
  }
});

app.get('/api/branches', async (req: Request, res: Response) => {
  const target = resolveTarget(req);
  try {
    const branches = await git.listBranches({ fs, dir: target });
    const current = await safeCurrentBranch(target);
    res.json({ branches, current });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list branches' });
  }
});

app.post('/api/checkout', async (req: Request, res: Response) => {
  const target = resolveTarget(req);
  const branch = typeof req.body?.branch === 'string' ? req.body.branch.trim() : '';
  const create = Boolean(req.body?.create);
  if (!branch) {
    res.status(400).json({ error: 'Branch name is required' });
    return;
  }
  try {
    if (create) {
      await runGitCommand(target, ['checkout', '-b', branch]);
    } else {
      await runGitCommand(target, ['checkout', branch]);
    }
    const state = await getRepoState(target);
    res.json({ ok: true, state });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to checkout branch' });
  }
});

app.post('/api/add-all', async (req: Request, res: Response) => {
  const target = resolveTarget(req);
  try {
    const before = await git.statusMatrix({ fs, dir: target });
    const beforeUntracked = before.filter(([, head, workdir, stage]) => head === 0 && stage === 0 && workdir !== 0).length;
    await runGitCommand(target, ['add', '-A']);
    const after = await git.statusMatrix({ fs, dir: target });
    const afterUntracked = after.filter(([, head, workdir, stage]) => head === 0 && stage === 0 && workdir !== 0).length;
    const addedUntracked = Math.max(0, beforeUntracked - afterUntracked);
    const state = await getRepoState(target);
    res.json({ ok: true, state, addedUntracked });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to stage changes' });
  }
});

app.post('/api/stage-modified', async (req: Request, res: Response) => {
  const target = resolveTarget(req);
  try {
    const matrix = await git.statusMatrix({ fs, dir: target });
    const files = matrix
      .filter(([, head, workdir, stage]) => head !== 0 && workdir !== stage)
      .map(([file]) => file);
    for (const file of files) {
      await runGitCommand(target, ['add', '--', file]);
    }
    const state = await getRepoState(target);
    res.json({ ok: true, state });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to stage modified files' });
  }
});

app.post('/api/track-all', async (req: Request, res: Response) => {
  const target = resolveTarget(req);
  try {
    const matrix = await git.statusMatrix({ fs, dir: target });
    const files = matrix
      .filter(([, head, workdir, stage]) => head === 0 && stage === 0 && workdir !== 0)
      .map(([file]) => file);
    for (const file of files) {
      await runGitCommand(target, ['add', '--', file]);
    }
    upsertTrackedPending(target, files);
    const state = await getRepoState(target);
    res.json({ ok: true, state });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to track untracked files' });
  }
});

app.post('/api/unstage-all', async (req: Request, res: Response) => {
  const target = resolveTarget(req);
  try {
    const before = await git.statusMatrix({ fs, dir: target });
    const beforeStaged = before.filter(([, head, , stage]) => stage !== head && head !== 0).length;
    try {
      await runGitCommand(target, ['restore', '--staged', '.']);
    } catch {
      await runGitCommand(target, ['reset', 'HEAD', '--', '.']);
    }
    const state = await getRepoState(target);
    const after = await git.statusMatrix({ fs, dir: target });
    const afterStaged = after.filter(([, head, , stage]) => stage !== head && head !== 0).length;
    res.json({ ok: true, state, changed: Math.max(0, beforeStaged - afterStaged) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to unstage changes' });
  }
});

app.post('/api/commit', async (req: Request, res: Response) => {
  const target = resolveTarget(req);
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) {
    res.status(400).json({ error: 'Commit message is required' });
    return;
  }
  try {
    await runGitCommand(target, ['commit', '-m', message]);
    const state = await getRepoState(target);
    res.json({ ok: true, state });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to commit changes' });
  }
});

app.post('/api/push', async (req: Request, res: Response) => {
  const target = resolveTarget(req);
  try {
    await runGitCommand(target, ['push']);
    const state = await getRepoState(target);
    res.json({ ok: true, state });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to push changes';
    const noUpstream = /has no upstream branch/i.test(message);
    if (noUpstream) {
      try {
        const branch = await safeCurrentBranch(target);
        if (!branch || branch.startsWith('(')) {
          res.status(500).json({ error: 'Failed to push changes: missing current branch for upstream setup' });
          return;
        }
        await runGitCommand(target, ['push', '--set-upstream', 'origin', branch]);
        const state = await getRepoState(target);
        res.json({ ok: true, state, upstreamSet: true });
        return;
      } catch (fallbackError) {
        res.status(500).json({ error: fallbackError instanceof Error ? fallbackError.message : 'Failed to push changes' });
        return;
      }
    }
    res.status(500).json({ error: message });
  }
});

app.post('/api/file-stage', async (req: Request, res: Response) => {
  const target = resolveTarget(req);
  const file = typeof req.body?.file === 'string' ? req.body.file : '';
  const stage = Boolean(req.body?.stage);
  if (!file) {
    res.status(400).json({ error: 'File path is required' });
    return;
  }
  try {
    if (stage) {
      await runGitCommand(target, ['add', '--', file]);
    } else {
      try {
        await runGitCommand(target, ['reset', 'HEAD', '--', file]);
      } catch {
        await runGitCommand(target, ['rm', '--cached', '--', file]);
      }
    }
    const state = await getRepoState(target);
    res.json({ ok: true, state });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to change file stage state' });
  }
});

app.post('/api/file-track', async (req: Request, res: Response) => {
  const target = resolveTarget(req);
  const file = typeof req.body?.file === 'string' ? req.body.file : '';
  const track = Boolean(req.body?.track);
  if (!file) {
    res.status(400).json({ error: 'File path is required' });
    return;
  }
  try {
    if (track) {
      await runGitCommand(target, ['add', '--', file]);
      upsertTrackedPending(target, [file]);
    } else {
      await runGitCommand(target, ['rm', '--cached', '--', file]);
      removeTrackedPending(target, [file]);
    }
    const state = await getRepoState(target);
    res.json({ ok: true, state });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to change file track state' });
  }
});

app.get('*', (_req: Request, res: Response) => {
  if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
    return;
  }
  res.status(404).json({ error: 'Frontend build not found. Run `npm run dev` for Vite or `npm run build` for production.' });
});

app.listen(PORT, () => {
  console.log(`Git dashboard listening on http://localhost:${PORT}`);
});
