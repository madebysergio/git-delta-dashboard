export type FileDelta = {
  file: string;
  additions: number;
  deletions: number;
};

export type CommitDelta = {
  oid: string;
  message: string;
  ts: number;
  additions: number;
  deletions: number;
  files: FileDelta[];
};

export type RepoState = {
  repository: string;
  repositoryPath?: string;
  branch: string;
  counts: {
    staged: number;
    modified: number;
    untracked: number;
    ahead: number;
    behind: number;
    recent: number;
  };
  meta?: {
    aheadMode?: 'local' | 'upstream';
    trackedPending?: string[];
  };
  details: {
    staged: FileDelta[];
    modified: FileDelta[];
    untracked: Array<{ file: string }>;
    ahead: CommitDelta[];
    behind: CommitDelta[];
    recent: CommitDelta[];
  };
};
