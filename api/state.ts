import type { VercelRequest, VercelResponse } from '@vercel/node';

type FileRow = { file: string; additions: number; deletions: number };
type CommitRow = {
  oid: string;
  message: string;
  ts: number;
  additions: number;
  deletions: number;
  files: FileRow[];
};

type ApiState = {
  repository: string;
  branch: string;
  counts: {
    staged: number;
    modified: number;
    untracked: number;
    ahead: number;
    behind: number;
  };
  meta: {
    aheadMode: 'local' | 'upstream';
  };
  details: {
    staged: FileRow[];
    modified: FileRow[];
    untracked: Array<{ file: string }>;
    ahead: CommitRow[];
    behind: CommitRow[];
  };
};

type GithubCommit = {
  sha: string;
  commit: {
    message: string;
    committer: { date: string };
  };
};

type GithubCommitDetail = {
  files?: Array<{ filename: string; additions: number; deletions: number }>;
  stats?: { additions: number; deletions: number };
};

const API_ROOT = 'https://api.github.com';
const MAX_COMMITS = 20;

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

function getConfig() {
  const owner = env('GITHUB_OWNER');
  const repo = env('GITHUB_REPO');
  const branch = env('GITHUB_BRANCH') || 'main';
  const token = env('GITHUB_TOKEN');
  if (!owner || !repo) {
    return { error: 'Missing GITHUB_OWNER or GITHUB_REPO environment variables.' } as const;
  }
  return { owner, repo, branch, token } as const;
}

async function ghFetch<T>(path: string, token?: string | null): Promise<T> {
  const res = await fetch(`${API_ROOT}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text.slice(0, 240)}`);
  }

  return (await res.json()) as T;
}

function toCommitRow(summary: GithubCommit, detail: GithubCommitDetail): CommitRow {
  const files: FileRow[] = (detail.files || []).map((f) => ({
    file: f.filename,
    additions: Number(f.additions || 0),
    deletions: Number(f.deletions || 0)
  }));

  return {
    oid: summary.sha,
    message: (summary.commit.message || '').trim() || summary.sha.slice(0, 7),
    ts: Math.floor(new Date(summary.commit.committer.date).getTime() / 1000),
    additions: Number(detail.stats?.additions || 0),
    deletions: Number(detail.stats?.deletions || 0),
    files
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const cfg = getConfig();
    if ('error' in cfg) {
      res.status(500).json({ error: cfg.error });
      return;
    }

    const { owner, repo, branch, token } = cfg;

    const commits = await ghFetch<GithubCommit[]>(
      `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${MAX_COMMITS}`,
      token
    );

    const detailed = await Promise.all(
      commits.map((c) => ghFetch<GithubCommitDetail>(`/repos/${owner}/${repo}/commits/${c.sha}`, token))
    );

    const ahead = commits.map((c, i) => toCommitRow(c, detailed[i]));

    const state: ApiState = {
      repository: repo,
      branch,
      counts: {
        staged: 0,
        modified: 0,
        untracked: 0,
        ahead: ahead.length,
        behind: 0
      },
      meta: {
        aheadMode: 'local'
      },
      details: {
        staged: [],
        modified: [],
        untracked: [],
        ahead,
        behind: []
      }
    };

    res.status(200).json(state);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load repository state' });
  }
}
