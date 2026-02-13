import { useEffect, useMemo, useState } from 'react';
import type { CommitDelta, FileDelta, RepoState } from './types';

const POLL_MS = 3500;

type Group = {
  id: 'staged' | 'modified' | 'untracked' | 'ahead' | 'behind';
  label: string;
  icon: 'staged' | 'unstaged' | 'untracked' | 'commits' | 'behind';
  value: number;
};

const CLASSES = {
  page: 'mx-auto flex h-full w-full max-w-6xl items-center justify-center p-4 sm:p-6',
  frame: 'grid h-[min(92vh,760px)] w-full grid-rows-[auto_auto_1fr] overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900',
  bar: 'flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5',
  title: 'truncate text-sm font-semibold tracking-tight text-slate-950 dark:text-slate-100 sm:text-base',
  branch: 'truncate text-xs font-medium text-slate-700 dark:text-slate-300 sm:text-sm',
  topRight: 'flex items-center gap-2',
  themeBtn: 'rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800 sm:text-sm',
  counters: 'flex gap-2 overflow-x-auto border-b border-slate-200 p-3 dark:border-slate-800 sm:p-4',
  counter: 'group flex min-w-[146px] cursor-pointer items-center justify-between rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-left transition hover:border-slate-400 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-slate-500 dark:hover:bg-slate-700/70 sm:min-w-[160px]',
  counterActive: 'border-slate-300 bg-slate-100 text-slate-900 shadow-sm dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900',
  counterCommits: 'border-teal-300 bg-teal-50 text-teal-900 shadow-sm dark:border-teal-600 dark:bg-teal-600 dark:text-white',
  counterUnstaged: 'border-amber-300 bg-amber-50 text-amber-900 shadow-sm dark:border-amber-600 dark:bg-amber-600 dark:text-white',
  counterLabel: 'text-xs font-medium text-slate-700 dark:text-slate-200',
  counterValue: 'text-2xl font-semibold leading-none tracking-tight',
  empty: 'flex h-full items-center justify-center px-4 text-center text-sm text-slate-700 dark:text-slate-300',
  panel: 'm-0 list-none overflow-auto p-0',
  row: 'flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-5',
  commitBlock: 'flex min-w-0 flex-1 flex-col gap-2',
  commitMeta: 'flex min-w-0 items-start justify-between gap-3',
  commitMetaLeft: 'flex min-w-0 flex-col items-start gap-1',
  commitTagLine: 'inline-flex items-center gap-2',
  commitMessage: 'whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-200',
  commitFiles: 'ml-1 flex min-w-0 flex-col gap-1',
  commitFile: 'flex items-center justify-between gap-2 text-xs text-slate-700 dark:text-slate-300',
  commitWhen: 'whitespace-nowrap text-xs text-slate-700 dark:text-slate-300',
  file: 'truncate text-sm text-slate-900 dark:text-slate-100',
  delta: 'whitespace-nowrap text-xs text-slate-700 dark:text-slate-300 sm:text-sm',
  err: 'm-0 p-4 text-sm text-red-600 dark:text-red-400 sm:p-5'
};

function stat(value: number | string | null | undefined): string {
  return Number.isFinite(Number(value)) ? String(Number(value)) : '0';
}

function formatCommitStamp(ts: number): string {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString('en-US', {
    year: '2-digit',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function formatRelative(ts: number, nowMs: number): string {
  if (!ts) return 'committed now';
  const diffSec = Math.max(0, Math.floor((nowMs - ts * 1000) / 1000));
  if (diffSec <= 1) return 'committed now';
  if (diffSec < 60) return `committed ${diffSec} sec ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `committed ${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `committed ${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `committed ${diffDay} day ago`;
}

function Icon({ kind, className }: { kind: Group['icon']; className?: string }) {
  const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className };
  if (kind === 'staged') return <svg {...base}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><rect x="4" y="18" width="16" height="3" rx="1" /></svg>;
  if (kind === 'unstaged') return <svg {...base}><path d="M4 6h16" /><path d="M4 12h10" /><path d="M4 18h7" /></svg>;
  if (kind === 'untracked') return <svg {...base}><circle cx="12" cy="12" r="8" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>;
  if (kind === 'commits') return <svg {...base}><circle cx="6" cy="6" r="2" /><circle cx="18" cy="12" r="2" /><circle cx="6" cy="18" r="2" /><path d="M8 7.5l8 3" /><path d="M8 16.5l8-3" /></svg>;
  return <svg {...base}><path d="M12 21V9" /><path d="m17 14-5-5-5 5" /></svg>;
}

function getInitialTheme(): 'dark' | 'light' {
  try {
    const stored = localStorage.getItem('git-dashboard-theme');
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {}
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyTheme(theme: 'dark' | 'light') {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem('git-dashboard-theme', theme);
  } catch {}
}

function FileRow({ item, status }: { item: FileDelta; status: 'staged' | 'unstaged' }) {
  const chipClass = status === 'staged'
    ? 'rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-sky-700 ring-1 ring-sky-300 dark:text-sky-300 dark:ring-sky-700'
    : 'rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-700 ring-1 ring-amber-300 dark:text-amber-300 dark:ring-amber-700';

  return (
    <li className={CLASSES.row}>
      <span className="flex min-w-0 items-center gap-2">
        <span className={CLASSES.file}>{item.file}</span>
        <span className={chipClass}>{status === 'staged' ? 'STAGED' : 'UNSTAGED'}</span>
      </span>
      <span className={CLASSES.delta}>
        <span className="text-emerald-600 dark:text-emerald-400">+{stat(item.additions)}</span>{' '}
        <span className="text-rose-600 dark:text-rose-400">-{stat(item.deletions)}</span>
      </span>
    </li>
  );
}

function CommitRow({ item, nowMs }: { item: CommitDelta; nowMs: number }) {
  const stamp = formatCommitStamp(item.ts);
  const relative = formatRelative(item.ts, nowMs);

  return (
    <li className={`${CLASSES.row} items-start`}>
      <span className={CLASSES.commitBlock}>
        <span className={CLASSES.commitMeta}>
          <span className={CLASSES.commitMetaLeft}>
            <span className={CLASSES.commitWhen}>{stamp}</span>
            <span className={CLASSES.commitTagLine}>
              <span className="inline-flex self-start rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-teal-700 ring-1 ring-teal-300 dark:text-teal-300 dark:ring-teal-700">COMMITTED</span>
              <span className={CLASSES.delta}>
                <span className="text-emerald-600 dark:text-emerald-400">+{stat(item.additions)}</span>{' '}
                <span className="text-rose-600 dark:text-rose-400">-{stat(item.deletions)}</span>
              </span>
            </span>
          </span>
          <span className={CLASSES.commitWhen}>{relative}</span>
        </span>

        <span className={CLASSES.commitMessage}>{item.message || item.oid.slice(0, 7)}</span>
        <ul className={CLASSES.commitFiles}>
          {item.files?.map((f) => (
            <li key={`${item.oid}-${f.file}`} className={CLASSES.commitFile}>
              <span className="truncate">{f.file}</span>
              <span className="whitespace-nowrap">
                <span className="text-emerald-600 dark:text-emerald-400">+{stat(f.additions)}</span>{' '}
                <span className="text-rose-600 dark:text-rose-400">-{stat(f.deletions)}</span>
              </span>
            </li>
          ))}
        </ul>
      </span>
    </li>
  );
}

export default function App() {
  const [state, setState] = useState<RepoState | null>(null);
  const [expanded, setExpanded] = useState<Group['id'] | null>(null);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>(getInitialTheme);
  const [, setAssetVersion] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const groups = useMemo<Group[]>(() => {
    if (!state) return [];
    const c = state.counts;
    const aheadLabel = state.meta?.aheadMode === 'local' ? 'commits' : 'ahead';
    const all: Group[] = [
      { id: 'staged', label: 'staged', icon: 'staged', value: c.staged },
      { id: 'modified', label: 'unstaged', icon: 'unstaged', value: c.modified },
      { id: 'untracked', label: 'untracked', icon: 'untracked', value: c.untracked },
      { id: 'ahead', label: aheadLabel, icon: 'commits', value: c.ahead },
      { id: 'behind', label: 'behind', icon: 'behind', value: c.behind }
    ];
    const byId = new Map(all.map((g) => [g.id, g] as const));
    const changed = new Set(all.filter((g) => g.value > 0).map((g) => g.id));

    const leadingOrder: Group['id'][] = c.modified > 0
      ? ['modified', 'ahead', 'untracked', 'behind']
      : ['ahead', 'modified', 'untracked', 'behind'];

    const ordered: Group[] = [];

    for (const id of leadingOrder) {
      const group = byId.get(id);
      if (!group) continue;
      if (id === 'modified' || changed.has(id)) ordered.push(group);
    }

    const staged = byId.get('staged');
    if (staged) ordered.push(staged);

    return ordered;
  }, [state]);

  useEffect(() => {
    if (!groups.length) {
      setExpanded(null);
      return;
    }
    if (expanded && !groups.some((g) => g.id === expanded)) {
      setExpanded(groups[0].id);
      return;
    }
    if (!expanded) setExpanded(groups[0].id);
  }, [expanded, groups]);

  useEffect(() => {
    let active = true;

    async function readJsonSafe<T>(res: Response): Promise<T> {
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(
          `API returned non-JSON (${res.status}). ${text.startsWith('<') ? 'Backend route is not available in this deployment.' : text}`
        );
      }
      return (await res.json()) as T;
    }

    async function fetchState() {
      try {
        const res = await fetch('/api/state');
        const body = await readJsonSafe<{ error?: string } & RepoState>(res);
        if (!res.ok) throw new Error(body.error || 'failed');
        if (!active) return;
        setState(body);
        setError('');
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'failed to load state');
      }
    }

    fetchState();
    const id = setInterval(fetchState, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let active = true;

    async function checkVersion() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) return;
        const body = (await res.json()) as { version?: string };
        if (!active || !body.version) return;
        setAssetVersion((prev) => {
          if (prev && prev !== body.version) window.location.reload();
          return body.version ?? prev;
        });
      } catch {}
    }

    checkVersion();
    const id = setInterval(checkVersion, 1500);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  if (error) {
    return (
      <section className={CLASSES.page}>
        <section className={CLASSES.frame}>
          <div className={CLASSES.bar}>error</div>
          <pre className={CLASSES.err}>{error}</pre>
        </section>
      </section>
    );
  }

  if (!state) {
    return (
      <section className={CLASSES.page}>
        <section className={CLASSES.frame}>
          <div className={CLASSES.bar}>loading</div>
        </section>
      </section>
    );
  }

  let detailRows: JSX.Element[] | null = null;
  if (expanded === 'staged') detailRows = state.details.staged.map((item) => <FileRow item={item} status="staged" key={item.file} />);
  if (expanded === 'modified') detailRows = state.details.modified.map((item) => <FileRow item={item} status="unstaged" key={item.file} />);
  if (expanded === 'untracked') {
    detailRows = state.details.untracked.map((item) => (
      <li className={CLASSES.row} key={item.file}>
        <span className={CLASSES.file}>{item.file}</span>
      </li>
    ));
  }
  if (expanded === 'ahead') detailRows = state.details.ahead.map((item) => <CommitRow item={item} nowMs={nowMs} key={item.oid} />);
  if (expanded === 'behind') detailRows = state.details.behind.map((item) => <CommitRow item={item} nowMs={nowMs} key={item.oid} />);

  return (
    <section className={CLASSES.page}>
      <section className={CLASSES.frame}>
        <header className={CLASSES.bar}>
          <div className="min-w-0">
            <div className={CLASSES.title}>{state.repository}</div>
            <div className={CLASSES.branch}>{state.branch}</div>
          </div>
          <div className={CLASSES.topRight}>
            <button type="button" className={CLASSES.themeBtn} onClick={() => setTheme((p) => (p === 'dark' ? 'light' : 'dark'))}>
              {theme === 'dark' ? 'light' : 'dark'}
            </button>
          </div>
        </header>

        <section className={CLASSES.counters}>
          {groups.map((g) => {
            const active = expanded === g.id;
            const labelClass = active
              ? g.id === 'ahead'
                ? 'text-teal-800 dark:text-white'
                : g.id === 'modified'
                  ? 'text-amber-800 dark:text-white'
                  : 'text-slate-900 dark:text-slate-900'
              : CLASSES.counterLabel;

            return (
              <button
                type="button"
                key={g.id}
                className={`${CLASSES.counter}${active ? ` ${g.id === 'ahead' ? CLASSES.counterCommits : g.id === 'modified' ? CLASSES.counterUnstaged : CLASSES.counterActive}` : ''}`}
                onClick={() => setExpanded((prev) => (prev === g.id ? null : g.id))}
              >
                <span className={`${labelClass} inline-flex items-center gap-1.5`}>
                  <Icon kind={g.icon} className="h-3.5 w-3.5" />
                  {g.label}
                </span>
                <span className={CLASSES.counterValue}>{g.value}</span>
              </button>
            );
          })}
        </section>

        {!expanded ? (
          <div className={CLASSES.empty}>{groups.length ? 'select a delta to inspect' : 'working tree clean'}</div>
        ) : (
          <ul className={CLASSES.panel}>{detailRows}</ul>
        )}
      </section>
    </section>
  );
}
