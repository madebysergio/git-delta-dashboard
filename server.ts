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

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
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
  let remoteRef = null;
  try {
    const remoteName = await git.getConfig({ fs, dir, path: `branch.${branch}.remote` });
    const mergeRef = await git.getConfig({ fs, dir, path: `branch.${branch}.merge` });
    if (remoteName && mergeRef && mergeRef.startsWith('refs/heads/')) {
      remoteRef = `refs/remotes/${remoteName}/${mergeRef.slice('refs/heads/'.length)}`;
    }
  } catch {}
  if (!remoteRef) {
    remoteRef = `refs/remotes/origin/${branch}`;
  }
  const localOid = await readRefOid(dir, localRef);
  const remoteOid = await readRefOid(dir, remoteRef);

  if (!localOid || !remoteOid) {
    const localCommits = await readCommits(dir, localRef, MAX_COMMIT_ROWS);
    const aheadCommits = localCommits.map((c) => compactCommit(c));
    return { ahead: aheadCommits.length, behind: 0, aheadCommits, behindCommits: [], aheadMode: 'local' };
  }

  const [localMap, remoteMap] = await Promise.all([
    readCommitMap(dir, localRef),
    readCommitMap(dir, remoteRef)
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
  counts: { staged: number; modified: number; untracked: number; ahead: number; behind: number };
  meta: { aheadMode: 'local' | 'upstream' };
  details: { staged: FileRow[]; modified: FileRow[]; untracked: UntrackedRow[]; ahead: CommitRow[]; behind: CommitRow[] };
}> {
  const repoName = path.basename(dir);
  const branch = await safeCurrentBranch(dir);
  const { staged, modified, untracked } = await listStateFiles(dir);
  const { ahead, behind, aheadCommits, behindCommits, aheadMode } = await getAheadBehind(dir, branch);
  await Promise.all([
    populateFileStats(dir, staged, true),
    populateFileStats(dir, modified, false),
    populateCommitStats(dir, aheadCommits),
    populateCommitStats(dir, behindCommits)
  ]);

  return {
    repository: repoName,
    branch,
    counts: {
      staged: staged.length,
      modified: modified.length,
      untracked: untracked.length,
      ahead,
      behind
    },
    meta: {
      aheadMode
    },
    details: {
      staged,
      modified,
      untracked,
      ahead: aheadCommits,
      behind: behindCommits
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
  const target = req.query.repo ? path.resolve(String(req.query.repo)) : DEFAULT_REPO;
  try {
    const state = await getRepoState(target);
    res.json(state);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to read repository state' });
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
