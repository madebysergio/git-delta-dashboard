import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as git from 'isomorphic-git';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 4173;
const DEFAULT_REPO = process.env.GIT_DASHBOARD_REPO || __dirname;

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
      staged.push({ file, additions: null, deletions: null });
    }
    if (isModified) {
      modified.push({ file, additions: null, deletions: null });
    }
  }

  return { staged, modified, untracked };
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
    additions: null,
    deletions: null
  };
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
