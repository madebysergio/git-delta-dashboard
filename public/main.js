import React, { useEffect, useMemo, useState } from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';

const POLL_MS = 3500;

const CLASSES = {
  page: 'mx-auto flex h-full w-full max-w-6xl items-center justify-center p-4 sm:p-6',
  frame: 'grid h-[min(92vh,760px)] w-full grid-rows-[auto_auto_1fr] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900',
  bar: 'flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5',
  title: 'truncate text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-base',
  branch: 'truncate text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm',
  topRight: 'flex items-center gap-2',
  themeBtn: 'rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 sm:text-sm',
  counters: 'flex gap-2 overflow-x-auto border-b border-slate-200 p-3 dark:border-slate-800 sm:p-4',
  counter: 'group flex min-w-[146px] cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-700/70 sm:min-w-[160px]',
  counterActive: 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900',
  counterLabel: 'text-xs font-medium text-slate-500 dark:text-slate-400',
  counterValue: 'text-2xl font-semibold leading-none tracking-tight',
  empty: 'flex h-full items-center justify-center px-4 text-center text-sm text-slate-500 dark:text-slate-400',
  panel: 'm-0 list-none overflow-auto p-0',
  row: 'flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-5',
  file: 'truncate text-sm text-slate-800 dark:text-slate-200',
  delta: 'whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 sm:text-sm',
  err: 'm-0 p-4 text-sm text-red-600 dark:text-red-400 sm:p-5'
};

function stat(value) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : '0';
}

function getInitialTheme() {
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

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem('git-dashboard-theme', theme);
  } catch {}
}

function FileRow({ item }) {
  return React.createElement(
    'li',
    { className: CLASSES.row },
    React.createElement('span', { className: CLASSES.file }, item.file),
    React.createElement(
      'span',
      { className: CLASSES.delta },
      React.createElement('span', { className: 'text-emerald-600 dark:text-emerald-400' }, `+${stat(item.additions)}`),
      ' ',
      React.createElement('span', { className: 'text-rose-600 dark:text-rose-400' }, `-${stat(item.deletions)}`)
    )
  );
}

function CommitRow({ item }) {
  const stamp = item.ts ? new Date(item.ts * 1000).toLocaleString() : '-';
  return React.createElement(
    'li',
    { className: CLASSES.row },
    React.createElement('span', { className: CLASSES.file }, item.message || item.oid.slice(0, 7)),
    React.createElement(
      'span',
      { className: CLASSES.delta },
      React.createElement('span', { className: 'text-emerald-600 dark:text-emerald-400' }, `+${stat(item.additions)}`),
      ' ',
      React.createElement('span', { className: 'text-rose-600 dark:text-rose-400' }, `-${stat(item.deletions)}`),
      ` ${stamp}`
    )
  );
}

function App() {
  const [state, setState] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState(getInitialTheme);
  const [assetVersion, setAssetVersion] = useState(null);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const groups = useMemo(() => {
    if (!state) return [];
    const c = state.counts;
    return [
      { id: 'staged', label: '+staged', value: c.staged },
      { id: 'modified', label: '~modified', value: c.modified },
      { id: 'untracked', label: '?untracked', value: c.untracked },
      { id: 'ahead', label: '↑ahead', value: c.ahead },
      { id: 'behind', label: '↓behind', value: c.behind }
    ].filter((g) => g.value > 0);
  }, [state]);

  useEffect(() => {
    if (expanded && !groups.some((g) => g.id === expanded)) {
      setExpanded(null);
    }
  }, [expanded, groups]);

  useEffect(() => {
    let active = true;

    async function fetchState() {
      try {
        const res = await fetch('/api/state');
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'failed');
        if (!active) return;
        setState(body);
        setError('');
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'failed to load state');
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
    let active = true;

    async function checkVersion() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        const body = await res.json();
        if (!active || !body?.version) return;
        setAssetVersion((prev) => {
          if (prev && prev !== body.version) {
            window.location.reload();
          }
          return body.version;
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
    return React.createElement(
      'section',
      { className: CLASSES.page },
      React.createElement(
        'section',
        { className: CLASSES.frame },
        React.createElement('div', { className: CLASSES.bar }, 'error'),
        React.createElement('pre', { className: CLASSES.err }, error)
      )
    );
  }

  if (!state) {
    return React.createElement(
      'section',
      { className: CLASSES.page },
      React.createElement(
        'section',
        { className: CLASSES.frame },
        React.createElement('div', { className: CLASSES.bar }, 'loading')
      )
    );
  }

  let detailRows = null;
  if (expanded === 'staged') detailRows = state.details.staged.map((item) => React.createElement(FileRow, { item, key: item.file }));
  if (expanded === 'modified') detailRows = state.details.modified.map((item) => React.createElement(FileRow, { item, key: item.file }));
  if (expanded === 'untracked') {
    detailRows = state.details.untracked.map((item) =>
      React.createElement(
        'li',
        { className: CLASSES.row, key: item.file },
        React.createElement('span', { className: CLASSES.file }, item.file)
      )
    );
  }
  if (expanded === 'ahead') detailRows = state.details.ahead.map((item) => React.createElement(CommitRow, { item, key: item.oid }));
  if (expanded === 'behind') detailRows = state.details.behind.map((item) => React.createElement(CommitRow, { item, key: item.oid }));

  return React.createElement(
    'section',
    { className: CLASSES.page },
    React.createElement(
      'section',
      { className: CLASSES.frame },
      React.createElement(
        'header',
        { className: CLASSES.bar },
        React.createElement(
          'div',
          { className: 'min-w-0' },
          React.createElement('div', { className: CLASSES.title }, state.repository),
          React.createElement('div', { className: CLASSES.branch }, state.branch)
        ),
        React.createElement(
          'div',
          { className: CLASSES.topRight },
          React.createElement(
            'button',
            {
              type: 'button',
              className: CLASSES.themeBtn,
              onClick: () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
            },
            theme === 'dark' ? 'light' : 'dark'
          )
        )
      ),
      React.createElement(
        'section',
        { className: CLASSES.counters },
        ...groups.map((g) => {
          const active = expanded === g.id;
          return React.createElement(
            'button',
            {
              type: 'button',
              key: g.id,
              className: `${CLASSES.counter}${active ? ` ${CLASSES.counterActive}` : ''}`,
              onClick: () => setExpanded((prev) => (prev === g.id ? null : g.id))
            },
            React.createElement('span', { className: CLASSES.counterLabel }, g.label),
            React.createElement('span', { className: CLASSES.counterValue }, String(g.value))
          );
        })
      ),
      !expanded
        ? React.createElement('div', { className: CLASSES.empty }, groups.length ? 'select a delta to inspect' : 'working tree clean')
        : React.createElement('ul', { className: CLASSES.panel }, ...(detailRows || []))
    )
  );
}

const app = document.getElementById('app');
if (!app) {
  throw new Error('Missing #app mount node');
}

createRoot(app).render(React.createElement(App));
