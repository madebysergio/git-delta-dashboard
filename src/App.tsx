import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommitDelta, FileDelta, RepoState } from './types';

const POLL_MS = 3500;

type Group = {
  id: 'staged' | 'modified' | 'untracked' | 'ahead' | 'behind';
  label: string;
  icon: 'staged' | 'unstaged' | 'untracked' | 'commits' | 'behind';
  value: number;
};

const CLASSES = {
  page: 'h-full w-full',
  frame: 'grid h-full w-full grid-rows-[auto_auto_auto_1fr_auto] bg-slate-200 dark:bg-slate-900',
  bar: 'flex flex-col gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5',
  title: 'text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-100',
  branch: 'mt-2 truncate text-2xl font-semibold text-slate-700 dark:text-slate-300',
  topRight: 'flex items-center gap-2',
  themeBtn: 'group cursor-pointer inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-400 text-slate-800 transition-colors duration-200 hover:bg-slate-100 active:bg-slate-200 dark:border-slate-500 dark:text-slate-100 dark:hover:bg-slate-800 dark:active:bg-slate-700',
  actions: 'border-b border-slate-200 dark:border-slate-800',
  actionFooter: 'border-t border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-5',
  actionBtn: 'cursor-pointer rounded-full border border-slate-400 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors duration-200 enabled:hover:bg-slate-200 enabled:active:bg-slate-300 disabled:cursor-default disabled:opacity-50 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:enabled:hover:bg-slate-700 dark:enabled:active:bg-slate-600',
  actionBtnFull: 'group cursor-pointer h-14 w-full rounded-full border border-slate-400 bg-slate-100 px-3 text-xs font-semibold uppercase tracking-wide text-slate-800 transition-colors duration-200 enabled:hover:bg-slate-200 enabled:active:bg-slate-300 disabled:cursor-default disabled:opacity-50 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:enabled:hover:bg-slate-700 dark:enabled:active:bg-slate-600',
  actionBtnCommit: 'group cursor-pointer h-14 w-full rounded-full border border-sky-400 bg-sky-100 px-3 text-xs font-semibold uppercase tracking-wide text-sky-900 transition-colors duration-200 enabled:hover:bg-sky-200 enabled:active:bg-sky-300 disabled:cursor-default disabled:opacity-50 dark:border-sky-500 dark:bg-sky-700 dark:text-white dark:enabled:hover:bg-sky-600 dark:enabled:active:bg-sky-500',
  actionBtnPush: 'group cursor-pointer h-14 w-full rounded-full border border-violet-500 bg-violet-500/75 px-3 text-xs font-semibold uppercase tracking-wide text-white transition-colors duration-200 enabled:hover:bg-violet-500 enabled:hover:text-white enabled:active:bg-violet-600 enabled:active:text-white disabled:cursor-default disabled:opacity-50 dark:border-violet-500 dark:bg-violet-600/75 dark:text-white dark:enabled:hover:bg-violet-500 dark:enabled:hover:text-white dark:enabled:active:bg-violet-400 dark:enabled:active:text-white',
  actionInput: 'min-w-[260px] rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-500 transition-all duration-200 focus:border-slate-500 focus:ring-2 focus:ring-slate-300/60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-slate-600/50',
  branchSelect: 'w-[8.25rem] appearance-none rounded-full border border-slate-300 bg-slate-50 pl-3 pr-10 py-2 text-sm text-slate-900 outline-none transition-colors duration-200 focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100',
  modalBackdrop: 'absolute inset-0 z-40 flex items-end justify-center bg-slate-950/88 p-4',
  modal: 'w-full max-w-xl rounded-2xl border border-slate-300 bg-slate-50 p-4 shadow-[0_14px_36px_-16px_rgba(15,23,42,0.18),0_2px_10px_-5px_rgba(15,23,42,0.12)] dark:border-slate-700 dark:bg-slate-900',
  modalTitle: 'text-sm font-semibold uppercase tracking-wide text-slate-900 dark:text-slate-100',
  modalRow: 'mt-3 flex flex-col gap-2',
  countersWrap: 'relative overflow-hidden border-b border-slate-200 dark:border-slate-800',
  counters: 'flex gap-2 overflow-x-auto px-4 py-3 sm:px-5',
  counter: 'group shrink-0 grid min-w-[146px] grid-cols-[28px_40px_1fr] items-center rounded-full border border-slate-300 bg-slate-100 px-5 py-2.5 text-left transition-colors duration-200 enabled:hover:border-slate-400 enabled:hover:bg-slate-50 enabled:active:bg-slate-200 disabled:cursor-default disabled:opacity-55 dark:border-slate-700 dark:bg-slate-800/90 dark:enabled:hover:border-slate-600 dark:enabled:hover:bg-slate-700/70 dark:enabled:active:bg-slate-700 sm:min-w-[160px]',
  counterActive: '!border-amber-500 !bg-amber-500 !text-white ring-2 ring-amber-200 shadow-[0_10px_24px_-14px_rgba(15,23,42,0.2),0_1px_4px_rgba(15,23,42,0.12)] dark:!border-slate-600 dark:!bg-amber-400 dark:!text-white dark:ring-0',
  counterUntracked: '!border-fuchsia-600 !bg-fuchsia-600 !text-white ring-2 ring-fuchsia-200 shadow-[0_10px_24px_-14px_rgba(15,23,42,0.2),0_1px_4px_rgba(15,23,42,0.12)] dark:!border-slate-600 dark:!bg-fuchsia-400 dark:!text-white dark:ring-0',
  counterCommits: '!border-emerald-500 !bg-emerald-500 !text-white ring-0 shadow-none dark:!border-slate-600 dark:!bg-emerald-500 dark:!text-white dark:ring-0',
  counterUnstaged: '!border-rose-600 !bg-rose-600 !text-white ring-2 ring-rose-200 shadow-[0_10px_24px_-14px_rgba(15,23,42,0.2),0_1px_4px_rgba(15,23,42,0.12)] dark:!border-slate-600 dark:!bg-rose-400 dark:!text-white dark:ring-0',
  counterLabel: 'text-xs font-medium uppercase tracking-wide text-slate-700 dark:text-slate-300',
  counterValue: 'text-2xl font-medium leading-none tracking-tight tabular-nums',
  empty: 'flex h-full items-center justify-center px-4 text-center text-lg text-slate-700 dark:text-slate-300',
  panelShell: 'relative h-full min-h-0 overflow-hidden',
  panel: 'm-0 h-full list-none overflow-auto p-0 pb-10',
  panelFade: 'pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-slate-200 dark:to-slate-900',
  row: 'mx-4 my-2 flex items-center justify-between gap-3 rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.16),0_2px_6px_-3px_rgba(15,23,42,0.12)] dark:border-slate-700 dark:bg-slate-800 sm:mx-5',
  commitBlock: 'flex min-w-0 flex-1 flex-col gap-1.5',
  commitMeta: 'flex min-w-0 items-start justify-between gap-3',
  commitMetaLeft: 'flex min-w-0 flex-col items-start gap-1',
  commitTagLine: 'flex w-full items-center justify-between',
  commitMessage: 'mt-0.5 whitespace-pre-wrap break-words text-lg text-slate-800 dark:text-slate-200',
  commitFiles: 'ml-1 flex min-w-0 flex-col gap-1',
  commitFile: 'flex items-center justify-between gap-2 text-base text-slate-700 dark:text-slate-300',
  commitWhen: 'whitespace-nowrap text-xs text-slate-500 dark:text-slate-400',
  commitFooter: 'flex w-full items-center justify-between',
  file: 'truncate text-base text-slate-900 dark:text-slate-100',
  delta: 'whitespace-nowrap text-base text-slate-700 dark:text-slate-300',
  err: 'm-0 p-4 text-base text-red-600 dark:text-red-400'
  ,
  toastWrap: 'pointer-events-none absolute inset-x-0 z-30 flex flex-col gap-2 px-4 sm:px-5',
  toast: 'pointer-events-auto inline-flex h-10 w-full items-center justify-between rounded-full border border-emerald-600 bg-emerald-600/95 px-4 text-xs font-semibold uppercase tracking-wide text-white shadow-[0_12px_30px_-18px_rgba(15,23,42,0.16),0_1px_3px_rgba(15,23,42,0.12)] backdrop-blur transition-all duration-200 dark:border-emerald-400 dark:bg-emerald-400/95 dark:text-white',
  toastClose: 'ml-3 inline-flex h-5 w-5 items-center justify-center rounded-full text-white transition-colors duration-200 hover:bg-emerald-500 active:bg-emerald-700 hover:text-white dark:text-white dark:hover:bg-emerald-300 dark:active:bg-emerald-500 dark:hover:text-white'
};

function stat(value: number | string | null | undefined): string {
  return Number.isFinite(Number(value)) ? String(Number(value)) : '0';
}

function formatCommitWhen(ts: number, nowMs: number): string {
  if (!ts) return 'TODAY @ --:--';
  const commitDate = new Date(ts * 1000);
  const nowDate = new Date(nowMs);
  const commitStart = new Date(commitDate.getFullYear(), commitDate.getMonth(), commitDate.getDate()).getTime();
  const nowStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
  const dayDiff = Math.floor((nowStart - commitStart) / 86400000);
  const time = commitDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  if (dayDiff <= 0) return `TODAY @ ${time}`;
  if (dayDiff === 1) return `YESTERDAY @ ${time}`;
  if (dayDiff >= 2 && dayDiff <= 6) return `${dayDiff} days ago @ ${time}`;
  if (dayDiff >= 7 && dayDiff <= 29) return `${dayDiff} days ago`;

  let months = (nowDate.getFullYear() - commitDate.getFullYear()) * 12 + (nowDate.getMonth() - commitDate.getMonth());
  if (nowDate.getDate() < commitDate.getDate()) months -= 1;
  months = Math.max(0, months);

  if (months < 12) return `${months} month(s) ago`;
  const years = Math.floor(months / 12);
  return `${years} year(s) ago`;
}

function formatSince(ts: number, nowMs: number): string {
  const delta = Math.max(0, Math.floor((nowMs - ts * 1000) / 1000));
  if (delta < 60) return `${delta} sec ago`;
  const min = Math.floor(delta / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  return day === 1 ? '1 day ago' : `${day} days ago`;
}

function truncateBranchName(name: string, max = 35): string {
  if (!name) return name;
  if (name.length <= max) return name;
  return `${name.slice(0, max)}...`;
}

function Icon({ kind, className }: { kind: Group['icon']; className?: string }) {
  const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className };
  if (kind === 'staged') return <svg {...base}><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.5 11 15.5 7.2" /><path d="M8.5 13 15.5 16.8" /></svg>;
  if (kind === 'unstaged') return <svg {...base}><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="12" r="2.5" /><circle cx="6" cy="18" r="2.5" /><path d="M8.5 7.2 15.5 10.8" /><path d="M8.5 16.8 15.5 13.2" /></svg>;
  if (kind === 'untracked') return <svg {...base}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M12 12v4" /><path d="M12 18h.01" /></svg>;
  if (kind === 'commits') return <svg {...base}><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="3.5" /><circle cx="19" cy="12" r="2" /><path d="M7 12h2" /><path d="M14 12h3" /></svg>;
  return <svg {...base}><path d="M12 21V9" /><path d="m17 14-5-5-5 5" /></svg>;
}

function ThemeIcon({ theme }: { theme: 'dark' | 'light' }) {
  if (theme === 'dark') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 transition-transform duration-200 ease-out group-hover:-rotate-12">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 transition-transform duration-300 ease-out group-hover:rotate-180">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
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

async function parseJsonOrThrow(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();

  const text = await res.text();
  const short = text.replace(/\s+/g, ' ').slice(0, 120);
  const code = res.status ? ` (${res.status})` : '';
  throw new Error(`API returned non-JSON${code}. ${short || 'No response body.'}`);
}

function FileRow({
  item,
  status,
  onToggle,
  disabled
}: {
  item: FileDelta;
  status: 'staged' | 'unstaged' | 'untracked';
  onToggle: () => void;
  disabled: boolean;
}) {
  const chipClass = status === 'staged'
    ? 'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold tracking-wide text-amber-700 ring-1 ring-amber-300 transition-colors duration-200 hover:bg-amber-50 active:bg-amber-100 dark:text-amber-300 dark:ring-amber-700 dark:hover:bg-amber-900/30 dark:active:bg-amber-900/50'
    : status === 'unstaged'
      ? 'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold tracking-wide text-rose-700 ring-1 ring-rose-300 transition-colors duration-200 hover:bg-rose-50 active:bg-rose-100 dark:text-rose-300 dark:ring-rose-700 dark:hover:bg-rose-900/30 dark:active:bg-rose-900/50'
      : 'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold tracking-wide text-fuchsia-700 ring-1 ring-fuchsia-300 transition-colors duration-200 hover:bg-fuchsia-50 active:bg-fuchsia-100 dark:text-fuchsia-300 dark:ring-fuchsia-700 dark:hover:bg-fuchsia-900/30 dark:active:bg-fuchsia-900/50';

  return (
    <li className={`${CLASSES.row} feed-enter`}>
      <span className="flex min-w-0 items-center gap-3">
        <button type="button" className={`${chipClass} cursor-pointer disabled:cursor-default disabled:opacity-50`} onClick={onToggle} disabled={disabled}>
          {status === 'staged' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <circle cx="6" cy="12" r="2.5" />
              <circle cx="18" cy="6" r="2.5" />
              <circle cx="18" cy="18" r="2.5" />
              <path d="M8.5 11 15.5 7.2" />
              <path d="M8.5 13 15.5 16.8" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <circle cx="6" cy="6" r="2.5" />
              <circle cx="18" cy="12" r="2.5" />
              <circle cx="6" cy="18" r="2.5" />
              <path d="M8.5 7.2 15.5 10.8" />
              <path d="M8.5 16.8 15.5 13.2" />
            </svg>
          )}
          <span>{status.toUpperCase()}</span>
        </button>
        <span className={CLASSES.file}>{item.file}</span>
      </span>
      <span className={`${CLASSES.delta} inline-flex items-center gap-2`}>
        <span className="font-semibold text-emerald-500 dark:text-emerald-300">+{stat(item.additions)}</span>
        <span className="font-semibold text-rose-500 dark:text-rose-300">-{stat(item.deletions)}</span>
      </span>
    </li>
  );
}

function CommitRow({ item, nowMs, pushed }: { item: CommitDelta; nowMs: number; pushed: boolean }) {
  const committedWhen = formatCommitWhen(item.ts, nowMs);
  const hasManyFiles = (item.files?.length || 0) >= 4;
  const [open, setOpen] = useState(false);
  const [expandedMeta, setExpandedMeta] = useState(false);

  return (
    <li
      className={`${CLASSES.row} feed-enter items-start cursor-pointer`}
      onClick={() => setExpandedMeta((v) => !v)}
    >
      <span className={CLASSES.commitBlock}>
        <span className={CLASSES.commitTagLine}>
          <span className="inline-flex items-center gap-2">
            <span className="inline-flex self-start items-center gap-1.5 rounded-full border border-emerald-400 bg-emerald-100/70 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-200">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                <line x1="4" y1="12" x2="20" y2="12" />
                <circle cx="12" cy="12" r="3.5" />
              </svg>
              COMMITTED
            </span>
            {pushed ? (
              <span className="inline-flex self-start items-center gap-1.5 rounded-full border border-violet-400 bg-violet-100/70 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-violet-700 dark:border-violet-500 dark:bg-violet-900/30 dark:text-violet-200">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                  <path d="M12 19V5" />
                  <path d="m7 10 5-5 5 5" />
                </svg>
                PUSHED
              </span>
            ) : (
              <span className="inline-flex self-start items-center gap-1.5 rounded-full border border-amber-400 bg-amber-100/70 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-500 dark:bg-amber-900/30 dark:text-amber-200">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
                READY FOR PUSH
              </span>
            )}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-500 px-3 py-2.5 text-xs font-semibold tracking-wide text-slate-200 dark:border-slate-500 dark:text-slate-200">
            <span className="font-semibold text-emerald-500 dark:text-emerald-300">+{stat(item.additions)}</span>
            <span className="font-semibold text-rose-500 dark:text-rose-300">-{stat(item.deletions)}</span>
          </span>
        </span>

        <span className={`${CLASSES.commitMessage} truncate`}>{item.message || item.oid.slice(0, 7)}</span>
        <div className="mt-2 border-t border-slate-300/60 dark:border-slate-600/70" />
        <span className={`inline-flex items-center pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 ${expandedMeta && !hasManyFiles ? 'justify-between' : 'justify-end'}`}>
          {expandedMeta && !hasManyFiles ? (
            <span className={`${CLASSES.commitWhen} inline-flex items-center gap-1.5`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              {committedWhen}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <span>{expandedMeta ? 'Collapse' : 'Expand'}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 transition-transform duration-200 ${expandedMeta ? 'rotate-180' : ''}`}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </span>

        <div className={`w-full overflow-hidden transition-all duration-300 ${expandedMeta ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'}`}>
          <span className={`${CLASSES.commitFooter} pt-2 ${hasManyFiles ? '' : 'justify-end'}`}>
            {hasManyFiles ? (
              <span className={`${CLASSES.commitWhen} inline-flex items-center gap-1.5`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                {committedWhen}
              </span>
            ) : <span />}
            {hasManyFiles ? (
            <button
              type="button"
              className="inline-flex items-center gap-4 text-xs font-semibold uppercase tracking-wide text-slate-600 transition-colors duration-200 hover:text-slate-800 active:text-slate-900 dark:text-slate-300/70 dark:hover:text-slate-200 dark:active:text-slate-100"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((v) => !v);
              }}
            >
                <span className="inline-flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-full border border-slate-500 pl-3 pr-2 text-xs font-semibold uppercase tracking-wide text-slate-700 transition-colors duration-200 hover:bg-slate-100 active:bg-slate-200 dark:border-slate-500 dark:text-slate-200 dark:hover:bg-slate-700/50 dark:active:bg-slate-700">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                    <path d="M14 3v6h6" />
                  </svg>
                  <span className="ml-1">{item.files.length}</span>
                  <span className="ml-1">FILES</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`ml-3 h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                  </span>
            </button>
            ) : <span />}
          </span>

          {expandedMeta && !hasManyFiles ? (
            <>
              <div className="my-2 border-t border-slate-300/60 dark:border-slate-600/70" />
              <ul className={CLASSES.commitFiles}>
              {item.files?.map((f) => (
                <li key={`${item.oid}-${f.file}`} className={CLASSES.commitFile}>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <span className="font-semibold text-emerald-500 dark:text-emerald-300">+{stat(f.additions)}</span>
                    <span className="font-semibold text-rose-500 dark:text-rose-300">-{stat(f.deletions)}</span>
                  </span>
                  <span className="truncate">{f.file}</span>
                </li>
              ))}
            </ul>
            </>
          ) : null}

          {open ? (
            <>
              <div className="my-2 border-t border-slate-300/60 dark:border-slate-600/70" />
              <ul className={CLASSES.commitFiles}>
              {item.files?.map((f) => (
                <li key={`${item.oid}-${f.file}`} className={CLASSES.commitFile}>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <span className="font-semibold text-emerald-500 dark:text-emerald-300">+{stat(f.additions)}</span>
                    <span className="font-semibold text-rose-500 dark:text-rose-300">-{stat(f.deletions)}</span>
                  </span>
                  <span className="truncate">{f.file}</span>
                </li>
              ))}
            </ul>
            </>
          ) : null}
        </div>
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
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [busyAction, setBusyAction] = useState<'add' | 'unstage' | 'commit' | 'push' | null>(null);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [branchBusy, setBranchBusy] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [branchInput, setBranchInput] = useState('');
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchMenuValue, setBranchMenuValue] = useState('');
  const [commitFilter, setCommitFilter] = useState<'all' | 'pushed' | 'unpushed'>('all');
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; leaving?: boolean }>>([]);
  const [toastBottom, setToastBottom] = useState(8);
  const toastTimers = useRef<Map<number, number>>(new Map());
  const toastId = useRef(1);
  const footerRef = useRef<HTMLElement | null>(null);
  const countersRef = useRef<HTMLElement | null>(null);
  const counterAutoDir = useRef<0 | 1 | -1>(0);
  const counterAutoRaf = useRef<number | null>(null);

  const showToast = useCallback((message: string, ttlMs = 4600) => {
    const id = toastId.current++;
    setToasts((prev) => [...prev, { id, message, leaving: false }]);
    const t = window.setTimeout(() => {
      setToasts((prev) => prev.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
      const t2 = window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== id));
        toastTimers.current.delete(id);
      }, 240);
      toastTimers.current.set(id, t2);
    }, ttlMs);
    toastTimers.current.set(id, t);
  }, []);

  const fetchBranches = useCallback(async (active = true) => {
    try {
      const res = await fetch('/api/branches');
      const body = await parseJsonOrThrow(res) as { branches?: string[] };
      if (!res.ok) return;
      if (!active) return;
      setBranches(Array.isArray(body.branches) ? body.branches : []);
    } catch {}
  }, []);

  const closeToast = useCallback((id: number) => {
    const t = toastTimers.current.get(id);
    if (t) {
      window.clearTimeout(t);
      toastTimers.current.delete(id);
    }
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    return () => {
      for (const t of toastTimers.current.values()) window.clearTimeout(t);
      toastTimers.current.clear();
      if (counterAutoRaf.current !== null) window.cancelAnimationFrame(counterAutoRaf.current);
    };
  }, []);

  const stopCounterAutoScroll = useCallback(() => {
    counterAutoDir.current = 0;
    if (counterAutoRaf.current !== null) {
      window.cancelAnimationFrame(counterAutoRaf.current);
      counterAutoRaf.current = null;
    }
  }, []);

  const startCounterAutoScroll = useCallback((dir: 1 | -1) => {
    counterAutoDir.current = dir;
    if (counterAutoRaf.current !== null) return;
    const tick = () => {
      const el = countersRef.current;
      if (!el || counterAutoDir.current === 0) {
        counterAutoRaf.current = null;
        return;
      }
      el.scrollLeft += counterAutoDir.current * 8;
      counterAutoRaf.current = window.requestAnimationFrame(tick);
    };
    counterAutoRaf.current = window.requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const placeToast = () => {
      const footerHeight = footerRef.current?.offsetHeight ?? 0;
      setToastBottom(footerHeight + 8);
    };
    placeToast();
    window.addEventListener('resize', placeToast);
    return () => window.removeEventListener('resize', placeToast);
  }, [state, commitOpen]);

  const groups = useMemo<Group[]>(() => {
    if (!state) return [];
    const c = state.counts;
    const aheadLabel = 'COMMITS';
    const all: Group[] = [
      { id: 'staged', label: 'STAGED', icon: 'staged', value: c.staged },
      { id: 'modified', label: 'UNSTAGED', icon: 'unstaged', value: c.modified },
      { id: 'untracked', label: 'UNTRACKED', icon: 'untracked', value: c.untracked },
      { id: 'ahead', label: aheadLabel, icon: 'commits', value: c.recent || c.ahead },
      { id: 'behind', label: 'BEHIND', icon: 'behind', value: c.behind }
    ];
    const byId = new Map(all.map((g) => [g.id, g] as const));
    const changed = new Set(all.filter((g) => g.value > 0).map((g) => g.id));

    const leadingOrder: Group['id'][] = c.modified > 0
      ? ['modified', 'staged', 'ahead', 'untracked', 'behind']
      : c.staged > 0
        ? ['staged', 'ahead', 'untracked', 'behind', 'modified']
        : ['ahead', 'modified', 'untracked', 'behind'];

    const ordered: Group[] = [];

    for (const id of leadingOrder) {
      const group = byId.get(id);
      if (!group) continue;
      if (id === 'modified' || changed.has(id)) ordered.push(group);
    }

    const staged = byId.get('staged');
    if (staged && !ordered.some((g) => g.id === 'staged')) ordered.push(staged);

    return ordered;
  }, [state]);

  useEffect(() => {
    if (!groups.length) {
      setExpanded(null);
      return;
    }
    const hasOtherActivity = groups.slice(1).some((g) => g.value > 0);
    const current = expanded ? groups.find((g) => g.id === expanded) : null;
    if (!expanded || !groups.some((g) => g.id === expanded)) {
      setExpanded(groups[0].id);
      return;
    }
    if (current && current.value === 0 && groups[0].value > 0 && expanded !== groups[0].id) {
      setExpanded(groups[0].id);
      return;
    }
    if (!hasOtherActivity && expanded !== groups[0].id) setExpanded(groups[0].id);
  }, [expanded, groups]);

  useEffect(() => {
    if (expanded === 'ahead') setCommitFilter('all');
  }, [expanded]);

  const fetchState = useCallback(async (active = true) => {
    try {
      const res = await fetch('/api/state');
      const body = await parseJsonOrThrow(res);
      if (!res.ok) throw new Error(body.error || 'failed');
      if (!active) return;
      setState(body as RepoState);
      setError('');
    } catch (err) {
      if (!active) return;
      setError(err instanceof Error ? err.message : 'failed to load state');
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchState(active);
    fetchBranches(active);
    const id = setInterval(() => fetchState(active), POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [fetchBranches, fetchState]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let active = true;

    async function checkVersion() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
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

  const hasAddableChanges = state.counts.modified > 0 || state.counts.untracked > 0;
  const canAddAll = hasAddableChanges || state.counts.staged > 0;
  const canCommit = state.counts.staged > 0;
  const canPush = state.counts.ahead > 0;
  const isCommitsView = expanded === 'ahead' || expanded === 'behind';
  const addAllLabel = expanded === 'modified' || expanded === 'untracked' ? 'STAGE ALL' : 'ADD ALL';
  const canUnstageAll = expanded === 'staged' && state.counts.staged > 0;

  async function checkoutBranch(branch: string, create = false): Promise<boolean> {
    const target = branch.trim();
    if (!target) return false;
    try {
      setBranchBusy(true);
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: target, create })
      });
      const payload = await parseJsonOrThrow(res);
      if (!res.ok) throw new Error(payload.error || 'checkout failed');
      await fetchState(true);
      await fetchBranches(true);
      setBranchInput('');
      showToast(create ? `Created and switched to ${target}` : `Switched to ${target}`);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'checkout failed');
      showToast('Branch action failed', 2200);
      return false;
    } finally {
      setBranchBusy(false);
    }
  }

  async function runAction(action: 'add' | 'unstage' | 'commit' | 'push') {
    try {
      setBusyAction(action);
      setError('');
      showToast(
        action === 'add'
          ? 'Adding all changes...'
          : action === 'unstage'
            ? 'Unstaging all changes...'
            : action === 'commit'
              ? 'Committing staged changes...'
              : 'Pushing commits...'
      );
      const endpoint = action === 'add'
        ? '/api/add-all'
        : action === 'unstage'
          ? '/api/unstage-all'
          : action === 'commit'
            ? '/api/commit'
            : '/api/push';
      const body = action === 'commit' ? { message: commitMessage.trim() } : {};
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const payload = await parseJsonOrThrow(res);
      if (!res.ok) throw new Error(payload.error || 'action failed');
      if (action === 'commit') {
        setCommitMessage('');
        setCommitOpen(false);
      }
      await fetchState(true);
      showToast(
        action === 'add'
          ? 'Added all changes'
          : action === 'unstage'
            ? (payload.changed > 0 ? 'Unstaged all changes' : 'No staged tracked changes to unstage')
            : action === 'commit'
              ? 'Commit created'
              : 'Push complete'
      );
      if (action === 'add' && Number(payload.addedUntracked) > 0) {
        showToast(`${payload.addedUntracked} untracked file(s) staged`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'action failed');
      showToast('Action failed', 2200);
    } finally {
      setBusyAction(null);
    }
  }

  async function toggleFileStage(file: string, stage: boolean) {
    try {
      setBusyFile(file);
      setError('');
      const res = await fetch('/api/file-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, stage })
      });
      const payload = await parseJsonOrThrow(res);
      if (!res.ok) throw new Error(payload.error || 'action failed');
      await fetchState(true);
      showToast(stage ? 'File staged' : 'File unstaged');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'action failed');
      showToast('Action failed', 2200);
    } finally {
      setBusyFile(null);
    }
  }

  let detailRows: JSX.Element[] | null = null;
  let lastPushedLabel = '';
  if (expanded === 'staged') {
    detailRows = state.details.staged.map((item) => (
      <FileRow
        item={item}
        status="staged"
        key={item.file}
        onToggle={() => toggleFileStage(item.file, false)}
        disabled={busyAction !== null || busyFile === item.file}
      />
    ));
  }
  if (expanded === 'modified') {
    detailRows = state.details.modified.map((item) => (
      <FileRow
        item={item}
        status="unstaged"
        key={item.file}
        onToggle={() => toggleFileStage(item.file, true)}
        disabled={busyAction !== null || busyFile === item.file}
      />
    ));
  }
  if (expanded === 'untracked') {
    detailRows = state.details.untracked.map((item) => (
      <FileRow
        item={{ file: item.file, additions: 0, deletions: 0 }}
        status="untracked"
        key={item.file}
        onToggle={() => toggleFileStage(item.file, true)}
        disabled={busyAction !== null || busyFile === item.file}
      />
    ));
  }
  if (expanded === 'ahead') {
    const aheadSet = new Set(state.details.ahead.map((c) => c.oid));
    const byNewest = (a: CommitDelta, b: CommitDelta) => (b.ts || 0) - (a.ts || 0);
    const pushedOnly = (state.details.recent || []).filter((c) => !aheadSet.has(c.oid)).sort(byNewest);
    const unpushedOnly = [...state.details.ahead].sort(byNewest);
    if (pushedOnly.length > 0 && pushedOnly[0].ts) {
      lastPushedLabel = `LAST PUSH ${formatSince(pushedOnly[0].ts, nowMs)}`;
    }
    const selected = commitFilter === 'unpushed'
      ? unpushedOnly
      : commitFilter === 'pushed'
        ? pushedOnly
        : [...unpushedOnly, ...pushedOnly];

    detailRows = selected.map((item) => (
      <CommitRow item={item} nowMs={nowMs} pushed={!aheadSet.has(item.oid)} key={item.oid} />
    ));
  }
  if (expanded === 'behind') detailRows = state.details.behind.map((item) => <CommitRow item={item} nowMs={nowMs} pushed={true} key={item.oid} />);

  return (
    <section className={CLASSES.page}>
      <section className={`${CLASSES.frame} relative`}>
        {toasts.length ? (
          <div className={CLASSES.toastWrap} style={{ bottom: `${toastBottom}px` }}>
            {toasts.map((t) => (
              <div key={t.id} className={`${CLASSES.toast} ${t.leaving ? 'toast-leave' : ''}`}>
                <span className="inline-flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <circle cx="12" cy="12" r="9" />
                    <path d="m8 12 2.5 2.5L16 9" />
                  </svg>
                  <span>{t.message}</span>
                </span>
                <button type="button" className={CLASSES.toastClose} onClick={() => closeToast(t.id)} aria-label="Close toast">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <header className={CLASSES.bar}>
          <div className="flex items-center justify-between gap-3">
            <div className={`${CLASSES.title} inline-flex items-center gap-2`}>
              <span className="repo-dot h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
              <span>{state.repository}</span>
            </div>
            <div className={CLASSES.topRight}>
              <button type="button" className={CLASSES.themeBtn} onClick={() => setTheme((p) => (p === 'dark' ? 'light' : 'dark'))}>
                <ThemeIcon theme={theme} />
              </button>
            </div>
          </div>
          <div className={`${CLASSES.branch} flex items-center justify-between gap-2`}>
            <span className="inline-flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <circle cx="6" cy="6" r="2" />
                <circle cx="18" cy="6" r="2" />
                <circle cx="18" cy="18" r="2" />
                <path d="M8 6h8" />
                <path d="M18 8v8" />
              </svg>
              <span className="block min-w-0 flex-1 truncate" title={state.branch}>{truncateBranchName(state.branch, 21)}</span>
            </span>
            <span className="relative inline-flex w-fit shrink-0">
            <select
              className={`${CLASSES.branchSelect} truncate`}
              value={branchMenuValue}
              disabled={branchBusy}
              onChange={(e) => {
                const next = e.target.value;
                setBranchMenuValue('');
                if (!next || next === state.branch) return;
                if (next === '__new__') {
                  setBranchOpen(true);
                  return;
                }
                checkoutBranch(next, false);
              }}
            >
              <option value="">Branch</option>
              {branches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
              <option value="__new__">New Branch</option>
            </select>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600 dark:text-slate-300">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
          </div>
        </header>
        <section className={CLASSES.actions}>
        </section>

        <section className={CLASSES.countersWrap}>
        <div
          className={CLASSES.counters}
          ref={countersRef}
          onMouseMove={(e) => {
            const el = countersRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const edge = 56;
            const x = e.clientX - rect.left;
            const maxScroll = el.scrollWidth - el.clientWidth;
            if (x >= rect.width - edge && el.scrollLeft < maxScroll) {
              startCounterAutoScroll(1);
            } else if (x <= edge && el.scrollLeft > 0) {
              startCounterAutoScroll(-1);
            } else {
              stopCounterAutoScroll();
            }
          }}
          onMouseLeave={stopCounterAutoScroll}
        >
          {groups.map((g) => {
            const active = expanded === g.id;
            const labelClass = active ? `${CLASSES.counterLabel} !text-current` : CLASSES.counterLabel;

            return (
              <button
                type="button"
                key={g.id}
                disabled={g.value === 0}
                className={`${CLASSES.counter}${active ? ` ${
                  g.id === 'ahead'
                    ? CLASSES.counterCommits
                    : g.id === 'modified'
                      ? CLASSES.counterUnstaged
                      : g.id === 'untracked'
                        ? CLASSES.counterUntracked
                        : CLASSES.counterActive
                }` : ''}`}
                onClick={() => {
                  if (g.value === 0) return;
                  setExpanded((prev) => (prev === g.id ? null : g.id));
                }}
              >
                <span className="inline-flex items-center justify-center">
                  <Icon kind={g.icon} className={g.id === 'ahead' ? 'h-7 w-7' : 'h-6 w-6'} />
                </span>
                <span className={`${CLASSES.counterValue} text-center`}>{g.value}</span>
                <span className={`${labelClass} pl-2`}>
                  {g.label}
                </span>
              </button>
            );
          })}
        </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-slate-200/70 via-slate-200/40 to-transparent dark:from-slate-900/70 dark:via-slate-900/40" />
        </section>

        {!expanded ? (
          <div className={CLASSES.empty}>{groups.length ? 'select a delta to inspect' : 'working tree clean'}</div>
        ) : (
          <section className={CLASSES.panelShell}>
            {expanded === 'ahead' ? (
              <div className="flex items-center justify-between px-3 pt-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 opacity-80 dark:text-slate-400">
                  {lastPushedLabel}
                </span>
                <button
                  type="button"
                  className={`${CLASSES.actionBtn} ${commitFilter === 'all' ? 'bg-slate-200 opacity-70 hover:bg-slate-200 active:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-900 dark:active:bg-slate-900' : ''}`}
                  onClick={() => setCommitFilter((p) => (p === 'all' ? 'unpushed' : p === 'unpushed' ? 'pushed' : 'all'))}
                >
                  <span className={`inline-flex items-center gap-1.5 ${commitFilter === 'all' ? 'opacity-80' : ''}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 ${commitFilter === 'all' ? 'opacity-80' : ''}`}>
                      <path d="M11 5h9" />
                      <path d="M11 12h7" />
                      <path d="M11 19h5" />
                      <path d="m4 8 3-3 3 3" />
                      <path d="M7 5v14" />
                    </svg>
                    SORT: {commitFilter.toUpperCase()}
                  </span>
                </button>
              </div>
            ) : null}
            <ul className={CLASSES.panel}>{detailRows}</ul>
            <div className={CLASSES.panelFade} />
          </section>
        )}

        {((!isCommitsView && (canAddAll || canCommit || canPush)) || (isCommitsView && canPush)) ? (
          <section className={CLASSES.actionFooter} ref={footerRef}>
            <div className="flex flex-col gap-2">
              {canUnstageAll ? (
                <button
                  type="button"
                  className={CLASSES.actionBtnFull}
                  disabled={busyAction !== null}
                  onClick={() => runAction('unstage')}
                >
                  <span className="inline-flex items-center justify-center">
                    <span className="mr-2 inline-flex w-4 items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <circle cx="6" cy="6" r="2.5" />
                        <circle cx="18" cy="12" r="2.5" />
                        <circle cx="6" cy="18" r="2.5" />
                        <path d="M8.5 7.2 15.5 10.8" />
                        <path d="M8.5 16.8 15.5 13.2" />
                      </svg>
                    </span>
                    <span>UNSTAGE ALL</span>
                  </span>
                </button>
              ) : null}

              {canAddAll && (expanded === 'modified' || expanded === 'untracked') ? (
                <button
                  type="button"
                  className={CLASSES.actionBtnFull}
                  disabled={busyAction !== null || !hasAddableChanges}
                  onClick={() => runAction('add')}
                >
                  <span className="inline-flex items-center justify-center">
                    <span className="mr-2 inline-flex w-4 items-center justify-center opacity-100 transition-all duration-200 group-disabled:opacity-0">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                        <path d="M14 3v5h5" />
                        <path d="M12 10v6" />
                        <path d="M9 13h6" />
                      </svg>
                    </span>
                    <span>{addAllLabel}</span>
                  </span>
                </button>
              ) : null}
              {!isCommitsView && canCommit ? (
                <button
                  type="button"
                  className={CLASSES.actionBtnCommit}
                  disabled={busyAction !== null}
                  onClick={() => setCommitOpen(true)}
                >
                  <span className="inline-flex items-center justify-center">
                    <span className="mr-2 inline-flex w-4 items-center justify-center opacity-100 transition-all duration-200 group-disabled:opacity-0">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <line x1="4" y1="12" x2="20" y2="12" />
                        <circle cx="12" cy="12" r="3.5" />
                      </svg>
                    </span>
                    <span>COMMIT</span>
                  </span>
                </button>
              ) : null}
              {canPush ? (
                <button
                  type="button"
                  className={CLASSES.actionBtnPush}
                  disabled={busyAction !== null}
                  onClick={() => runAction('push')}
                >
                  <span className="inline-flex items-center justify-center">
                    <span className="mr-2 inline-flex w-4 items-center justify-center opacity-100 transition-all duration-200 group-disabled:opacity-0">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <circle cx="6" cy="12" r="2.5" />
                        <circle cx="18" cy="6" r="2.5" />
                        <circle cx="18" cy="18" r="2.5" />
                        <path d="M8.5 11 15.5 7.2" />
                        <path d="M8.5 13 15.5 16.8" />
                        <path d="M18 3.5v5" />
                        <path d="m16 6.5 2-3 2 3" />
                      </svg>
                    </span>
                    <span>PUSH</span>
                  </span>
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {commitOpen ? (
          <section className={CLASSES.modalBackdrop}>
            <div className={CLASSES.modal}>
              <input
                autoFocus
                className="h-14 w-full rounded-full border border-slate-300 bg-white px-4 text-xs font-semibold uppercase tracking-wide text-slate-900 outline-none placeholder:text-slate-500 focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                placeholder="Enter commit message"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
              />
              <div className={CLASSES.modalRow}>
                <button
                  type="button"
                  className={CLASSES.actionBtnFull}
                  onClick={() => {
                    setCommitOpen(false);
                    setCommitMessage('');
                  }}
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  className={CLASSES.actionBtnCommit}
                  disabled={busyAction !== null || !commitMessage.trim()}
                  onClick={() => runAction('commit')}
                >
                  <span className="inline-flex items-center justify-center">
                    <span className="mr-0 w-0 overflow-hidden opacity-0 transition-all duration-200 group-hover:mr-2 group-hover:w-4 group-hover:opacity-100 group-disabled:mr-0 group-disabled:w-0 group-disabled:opacity-0 group-disabled:transition-none">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <line x1="4" y1="12" x2="20" y2="12" />
                        <circle cx="12" cy="12" r="3.5" />
                      </svg>
                    </span>
                    <span>COMMIT</span>
                  </span>
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {branchOpen ? (
          <section className={CLASSES.modalBackdrop}>
            <div className={CLASSES.modal}>
              <input
                autoFocus
                className="h-14 w-full rounded-full border border-slate-300 bg-white px-4 text-xs font-semibold uppercase tracking-wide text-slate-900 outline-none placeholder:text-slate-500 focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                placeholder="new-branch-name"
                value={branchInput}
                onChange={(e) => setBranchInput(e.target.value)}
              />
              <div className={CLASSES.modalRow}>
                <button
                  type="button"
                  className={CLASSES.actionBtnFull}
                  onClick={() => {
                    setBranchOpen(false);
                    setBranchInput('');
                  }}
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  className={CLASSES.actionBtnCommit}
                  disabled={branchBusy || !branchInput.trim()}
                  onClick={async () => {
                    const ok = await checkoutBranch(branchInput, true);
                    if (ok) setBranchOpen(false);
                  }}
                >
                  <span className="inline-flex items-center justify-center">
                    <span className="mr-0 w-0 overflow-hidden opacity-0 transition-all duration-200 group-hover:mr-2 group-hover:w-4 group-hover:opacity-100 group-disabled:mr-0 group-disabled:w-0 group-disabled:opacity-0 group-disabled:transition-none">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <path d="M12 19V5" />
                        <path d="m7 10 5-5 5 5" />
                      </svg>
                    </span>
                    <span>CREATE + SWITCH</span>
                  </span>
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </section>
    </section>
  );
}
