import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as git from 'isomorphic-git';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 4173;
const DEFAULT_REPO = process.env.GIT_DASHBOARD_REPO || __dirname;
const execFileAsync = promisify(execFile);
const GIT_BIN = process.env.GIT_BIN || '/usr/bin/git';
const VERSION_FILES = [
  path.join(__dirname, 'public', 'index.html'),
  path.join(__dirname, 'public', 'main.js'),
  path.join(__dirname, 'public', 'styles.css')
];

app.use(express.static(path.join(__dirname, 'public')));

async function safeCurrentBranch(dir) {
  try {
    return await git.currentBranch({ fs, dir, fullname: false }) || '(detached)';
  } catch {
    return '(unknown)';
  }
}

async function listStateFiles(dir) {
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

function parseNumstat(raw) {
  const stats = new Map();
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

async function getDiffNumstatMap(dir, args) {
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

async function getFileDiffStat(dir, file, cached = false) {
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

async function populateFileStats(dir, rows, cached = false) {
  await Promise.all(
    rows.map(async (row) => {
      const stat = await getFileDiffStat(dir, row.file, cached);
      row.additions = stat.additions;
      row.deletions = stat.deletions;
    })
  );
}

async function readRefOid(dir, ref) {
  try {
    return await git.resolveRef({ fs, dir, ref });
  } catch {
    return null;
  }
}

async function readCommitMap(dir, ref, depth = 300) {
  try {
    const commits = await git.log({ fs, dir, ref, depth });
    return new Map(commits.map((c, idx) => [c.oid, { idx, commit: c }]));
  } catch {
    return new Map();
  }
}

function countUntilBase(map, baseOid) {
  if (!baseOid) return 0;
  const base = map.get(baseOid);
  return base ? base.idx : 0;
}

function compactCommit(commit) {
  return {
    oid: commit.oid,
    message: (commit.commit.message || '').split('\n')[0],
    ts: commit.commit.committer?.timestamp || 0,
    additions: 0,
    deletions: 0
  };
}

async function getCommitDiffStat(dir, oid) {
  const statMap = await getDiffNumstatMap(dir, ['show', '--numstat', '--format=', oid]);
  let additions = 0;
  let deletions = 0;
  for (const stat of statMap.values()) {
    additions += stat.additions;
    deletions += stat.deletions;
  }
  return { additions, deletions };
}

async function populateCommitStats(dir, commits) {
  await Promise.all(
    commits.map(async (commit) => {
      const stat = await getCommitDiffStat(dir, commit.oid);
      commit.additions = stat.additions;
      commit.deletions = stat.deletions;
    })
  );
}

async function getAheadBehind(dir, branch) {
  if (!branch || branch === '(detached)' || branch === '(unknown)') {
    return { ahead: 0, behind: 0, aheadCommits: [], behindCommits: [] };
  }

  const localRef = `refs/heads/${branch}`;
  const remoteRef = `refs/remotes/origin/${branch}`;
  const localOid = await readRefOid(dir, localRef);
  const remoteOid = await readRefOid(dir, remoteRef);

  if (!localOid || !remoteOid) {
    return { ahead: 0, behind: 0, aheadCommits: [], behindCommits: [] };
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
    .slice(0, Math.min(ahead, 12))
    .map((v) => compactCommit(v.commit));

  const behindCommits = Array.from(remoteMap.values())
    .slice(0, Math.min(behind, 12))
    .map((v) => compactCommit(v.commit));

  return { ahead, behind, aheadCommits, behindCommits };
}

async function getRepoState(dir) {
  const repoName = path.basename(dir);
  const branch = await safeCurrentBranch(dir);
  const { staged, modified, untracked } = await listStateFiles(dir);
  const { ahead, behind, aheadCommits, behindCommits } = await getAheadBehind(dir, branch);
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
    details: {
      staged,
      modified,
      untracked,
      ahead: aheadCommits,
      behind: behindCommits
    }
  };
}

function getAssetVersion() {
  let maxMtimeMs = 0;
  for (const file of VERSION_FILES) {
    try {
      const stat = fs.statSync(file);
      if (stat.mtimeMs > maxMtimeMs) maxMtimeMs = stat.mtimeMs;
    } catch {}
  }
  return String(Math.floor(maxMtimeMs));
}

app.get('/api/version', (_req, res) => {
  res.json({ version: getAssetVersion() });
});

app.get('/api/state', async (req, res) => {
  const target = req.query.repo ? path.resolve(String(req.query.repo)) : DEFAULT_REPO;
  try {
    const state = await getRepoState(target);
    res.json(state);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to read repository state' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Git dashboard listening on http://localhost:${PORT}`);
});
