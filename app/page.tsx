'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { signOut } from 'next-auth/react';
import type { Task, ViewType, FocusFilter, FilterType, GeneratedTask } from '@/lib/types';
import { getDateBucket, DATE_BUCKET_ORDER, DATE_BUCKET_ICON } from '@/lib/dateHelpers';
import { scoreTask, generateInsight, INBOX_LIMIT } from '@/lib/scoring';
import { defaultStrategy } from '@/lib/defaults';

// ── CONSTANTS ──

const ACTIVITY_LABEL: Record<string, string> = {
  email: '<span class="mi xs">mail</span> Email',
  meeting: '<span class="mi xs">event</span> Meeting',
  focus: '<span class="mi xs">radio_button_checked</span> Focus Time',
  other: '<span class="mi xs">more_horiz</span> Other',
};

const PRIORITY_LABEL: Record<string, string> = {
  high: '<span class="mi xs">flag</span> High',
  medium: '<span class="mi xs">flag</span> Medium',
  low: '<span class="mi xs">flag</span> Low',
};

const FILTER_TYPE_LABEL: Record<FilterType, string> = {
  priority: 'Priority',
  activity: 'Activity',
  client: 'Client',
  project: 'Project',
  date: 'Date',
};

// ── CHART ──

interface ChartBar {
  label: string;
  value: number;
  color: string;
}

const ACTIVITY_LABEL_TO_VALUE: Record<string, string> = {
  Email: 'email',
  Meeting: 'meeting',
  Focus: 'focus',
  Other: 'other',
};

const PRIORITY_LABEL_TO_VALUE: Record<string, string> = {
  High: 'high',
  Medium: 'medium',
  Low: 'low',
};

function SidebarChart({
  data,
  onBarClick,
}: {
  data: ChartBar[];
  onBarClick?: (label: string) => void;
}) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    label: string;
    value: number;
    color: string;
  } | null>(null);

  if (data.length === 0) return null;

  const W = 196, H = 64, barAreaH = 54, gap = 5, topPad = 6;
  const n = data.length;
  const barW = Math.floor((W - (n - 1) * gap) / n);
  const maxVal = Math.max(...data.map((d) => d.value), 1);

  const handleBarClick = (d: ChartBar) => {
    if (d.value > 0 && onBarClick) onBarClick(d.label);
  };

  return (
    <div className="sidebar-chart-wrap">
      <svg
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', width: '100%', cursor: onBarClick ? 'pointer' : undefined }}
      >
        {data.map((d, i) => {
          const x = i * (barW + gap);
          const bh = Math.max(
            Math.round((d.value / maxVal) * barAreaH),
            d.value > 0 ? 4 : 0
          );
          const y = topPad + barAreaH - bh;
          return (
            <g key={d.label}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={bh}
                fill={d.color}
                rx={3}
                opacity={0.85}
              />
              <rect
                x={x}
                y={topPad}
                width={barW}
                height={barAreaH}
                fill="transparent"
                style={{ cursor: onBarClick && d.value > 0 ? 'pointer' : undefined }}
                onMouseOver={(e) =>
                  setTooltip({
                    x: e.clientX,
                    y: e.clientY - 36,
                    label: d.label,
                    value: d.value,
                    color: d.color,
                  })
                }
                onMouseLeave={() => setTooltip(null)}
                onClick={() => handleBarClick(d)}
              />
            </g>
          );
        })}
      </svg>
      {tooltip && (
        <div
          style={{
            display: 'block',
            position: 'fixed',
            background: '#2a2a2e',
            border: `1px solid ${tooltip.color}`,
            borderRadius: 6,
            padding: '5px 9px',
            fontSize: 11,
            fontWeight: 500,
            color: '#f0f0f5',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 300,
            transform: 'translateX(-50%)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
          {tooltip.label} · {tooltip.value} task{tooltip.value !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

function buildChartData(
  view: ViewType,
  tasks: Task[],
  strategyItems: string[]
): ChartBar[] {
  const open = tasks.filter((t) => !t.completed);
  const palette = [
    '#0a84ff', '#30d158', '#ffa020', '#ff453a', '#7c7cff', '#40a9ff', '#ff6b6b',
  ];

  if (view === 'inbox') {
    const inboxPool = open
      .map((t) => ({ task: t, score: scoreTask(t, strategyItems) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, INBOX_LIMIT)
      .map((x) => x.task);
    return [
      { label: 'High', value: inboxPool.filter((t) => t.priority === 'high').length, color: '#ff453a' },
      { label: 'Medium', value: inboxPool.filter((t) => t.priority === 'medium').length, color: '#ffa020' },
      { label: 'Low', value: inboxPool.filter((t) => t.priority === 'low').length, color: '#30d158' },
    ];
  }
  if (view === 'priority') {
    return [
      { label: 'High', value: open.filter((t) => t.priority === 'high').length, color: '#ff453a' },
      { label: 'Medium', value: open.filter((t) => t.priority === 'medium').length, color: '#ffa020' },
      { label: 'Low', value: open.filter((t) => t.priority === 'low').length, color: '#30d158' },
    ];
  }
  if (view === 'activity') {
    return [
      { label: 'Email', value: open.filter((t) => t.activity === 'email').length, color: '#7c7cff' },
      { label: 'Meeting', value: open.filter((t) => t.activity === 'meeting').length, color: '#40a9ff' },
      { label: 'Focus', value: open.filter((t) => t.activity === 'focus').length, color: '#ffa020' },
      { label: 'Other', value: open.filter((t) => t.activity === 'other').length, color: '#8e8e99' },
    ];
  }
  if (view === 'date') {
    const counts: Record<string, number> = {};
    open.forEach((t) => {
      const b = getDateBucket(t.dueDate);
      counts[b] = (counts[b] || 0) + 1;
    });
    const bucketColors: Record<string, string> = {
      Overdue: '#ff453a', Today: '#0a84ff', Tomorrow: '#7c7cff',
      'This Week': '#ffa020', Later: '#30d158', 'No Date': '#8e8e99',
    };
    return DATE_BUCKET_ORDER
      .filter((b) => counts[b])
      .map((b) => ({ label: b, value: counts[b], color: bucketColors[b] }));
  }
  // client, project, focus
  const key = (view === 'project') ? 'project' : 'client';
  const counts: Record<string, number> = {};
  open.forEach((t) => {
    const k = t[key];
    counts[k] = (counts[k] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v], i) => ({ label: k, value: v, color: palette[i % palette.length] }));
}

// ── GENERATED TASK CARD ──

const URGENCY_LABEL: Record<string, string> = {
  today: '<span class="mi xs">bolt</span> Today',
  this_week: '<span class="mi xs">calendar_today</span> This week',
  later: '<span class="mi xs">schedule</span> Later',
};

const SOURCE_LABEL: Record<string, string> = {
  gmail: 'Gmail',
  granola: 'Granola',
  hubspot: 'HubSpot',
};

function GeneratedTaskCard({
  task,
  onToggle,
}: {
  task: GeneratedTask & { completed?: boolean };
  onToggle: (id: string) => void;
}) {
  return (
    <div className={`task-card priority-${task.priority} ${task.completed ? 'completed' : ''}`}>
      <div className="inbox-rank">#{task.rank}</div>
      <div
        className={`task-check ${task.completed ? 'checked' : ''}`}
        onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}
      >
        {task.completed && (
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>
        )}
      </div>
      <div className="task-body">
        <div className="task-header">
          <div className="task-title">{task.title}</div>
          <div className="source-badge">
            {task.sources.map((s) => SOURCE_LABEL[s] ?? s).join(' · ')}
          </div>
        </div>
        <div className="task-desc" style={{ fontStyle: 'italic', color: '#8e8e99' }}>
          {task.context}
        </div>
        <div className="task-meta">
          <span
            className={`tag priority-${task.priority}`}
            dangerouslySetInnerHTML={{ __html: (task.priority.charAt(0).toUpperCase() + task.priority.slice(1)) }}
          />
          <span
            className="tag"
            dangerouslySetInnerHTML={{ __html: URGENCY_LABEL[task.urgency] || task.urgency }}
          />
          <span
            className={`tag activity-${task.activity}`}
            dangerouslySetInnerHTML={{
              __html: {
                email: '<span class="mi xs">mail</span> Email',
                meeting: '<span class="mi xs">event</span> Meeting',
                focus: '<span class="mi xs">radio_button_checked</span> Focus',
                other: '<span class="mi xs">more_horiz</span> Other',
              }[task.activity] || task.activity,
            }}
          />
          {task.client && (
            <span className="tag">
              <span className="mi xs">business</span> {task.client}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── TASK CARD ──

function TaskCard({
  task,
  rank,
  focusFilters,
  onToggle,
  onAddFilter,
}: {
  task: Task;
  rank?: number;
  focusFilters: FocusFilter[];
  onToggle: (id: number) => void;
  onAddFilter: (type: FilterType, value: string) => void;
}) {
  const isActiveFilter = (type: FilterType, value: string) =>
    focusFilters.some((f) => f.type === type && f.value === value);

  return (
    <div className={`task-card priority-${task.priority} ${task.completed ? 'completed' : ''}`}>
      {rank != null && rank > 0 && (
        <div className="inbox-rank">#{rank}</div>
      )}
      <div
        className={`task-check ${task.completed ? 'checked' : ''}`}
        onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}
      >
        {task.completed && (
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>
        )}
      </div>
      <div className="task-body">
        <div className="task-header">
          <div className="task-title">{task.title}</div>
          <div className="source-badge">
            {task.source}{task.manual ? ' · Manual' : ''}
          </div>
        </div>
        <div className="task-desc">{task.desc}</div>
        <div className="task-meta">
          <span
            className={`tag clickable priority-${task.priority}${isActiveFilter('priority', task.priority) ? ' active-filter' : ''}`}
            onClick={(e) => { e.stopPropagation(); onAddFilter('priority', task.priority); }}
            dangerouslySetInnerHTML={{ __html: PRIORITY_LABEL[task.priority] }}
          />
          <span
            className={`tag clickable activity-${task.activity}${isActiveFilter('activity', task.activity) ? ' active-filter' : ''}`}
            onClick={(e) => { e.stopPropagation(); onAddFilter('activity', task.activity); }}
            dangerouslySetInnerHTML={{ __html: ACTIVITY_LABEL[task.activity] }}
          />
          <span
            className={`tag clickable${isActiveFilter('client', task.client) ? ' active-filter' : ''}`}
            onClick={(e) => { e.stopPropagation(); onAddFilter('client', task.client); }}
          >
            <span className="mi xs">business</span> {task.client}
          </span>
          <span
            className={`tag clickable${isActiveFilter('project', task.project) ? ' active-filter' : ''}`}
            onClick={(e) => { e.stopPropagation(); onAddFilter('project', task.project); }}
          >
            <span className="mi xs">folder</span> {task.project}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── MAIN DASHBOARD ──

function DashboardContent() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [generatedTasks, setGeneratedTasks] = useState<(GeneratedTask & { completed?: boolean })[]>([]);
  const [sourceStatus, setSourceStatus] = useState<Record<string, string>>({
    gmail: 'disconnected',
    granola: 'disconnected',
    hubspot: 'disconnected',
  });
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({
    gmail: 0,
    granola: 0,
    hubspot: 0,
  });
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [currentView, setCurrentViewRaw] = useState<ViewType>('inbox');
  const [focusFilters, setFocusFilters] = useState<FocusFilter[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [strategyItems, setStrategyItems] = useState<string[]>(defaultStrategy);
  const [strategyLoaded, setStrategyLoaded] = useState(false);
  const [insightText, setInsightText] = useState<string>('');
  const [insightLoading, setInsightLoading] = useState(false);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [strategyModalOpen, setStrategyModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [nextId, setNextId] = useState(100);
  const [nextRefresh, setNextRefresh] = useState('');

  // Add task form state
  const [addTitle, setAddTitle] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addPriority, setAddPriority] = useState<Task['priority']>('medium');
  const [addActivity, setAddActivity] = useState<Task['activity']>('email');
  const [addClient, setAddClient] = useState('');
  const [addProject, setAddProject] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();

  // Strategy modal fields (synced when modal opens)
  const [strategy1, setStrategy1] = useState('');
  const [strategy2, setStrategy2] = useState('');
  const [strategy3, setStrategy3] = useState('');

  // ── FETCH TASKS ──
  const refetchTasks = useCallback(() => {
    fetch('/api/tasks')
      .then((r) => r.json())
      .then((data) => {
        setTasks(data.tasks);
        if (Array.isArray(data.generatedTasks) && data.generatedTasks.length > 0) {
          setGeneratedTasks(data.generatedTasks.map((t: GeneratedTask) => ({ ...t, completed: false })));
        }
        setSourceStatus(data.sources);
        setSourceCounts(data.sourceCounts ?? { gmail: 0, granola: 0, hubspot: 0 });
        setRefreshedAt(data.refreshedAt);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    refetchTasks();
  }, [refetchTasks]);

  // ── FETCH SETTINGS (Weekly Strategy) ──
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.weeklyStrategy?.length === 3) {
          setStrategyItems(data.weeklyStrategy);
        }
        setStrategyLoaded(true);
      })
      .catch(() => setStrategyLoaded(true));
  }, []);

  // Handle Granola OAuth callback
  useEffect(() => {
    const granola = searchParams.get('granola');
    const error = searchParams.get('granola_error');
    if (granola === 'connected' || error) {
      refetchTasks();
      window.history.replaceState({}, '', '/');
    }
  }, [searchParams, refetchTasks]);

  // ── INSIGHT ──
  useEffect(() => {
    if (tasks.length > 0) {
      setInsightText(generateInsight(tasks, strategyItems));
    }
  }, [tasks, strategyItems]);

  // Sync strategy modal fields when modal opens
  useEffect(() => {
    if (strategyModalOpen) {
      setStrategy1(strategyItems[0] ?? '');
      setStrategy2(strategyItems[1] ?? '');
      setStrategy3(strategyItems[2] ?? '');
    }
  }, [strategyModalOpen, strategyItems]);

  // ── NEXT REFRESH LABEL ──
  useEffect(() => {
    const h = new Date().getHours();
    const label =
      h < 6 ? '6:00 AM' :
      h < 12 ? '12:00 PM' :
      h < 18 ? '6:00 PM' :
      '6:00 AM tomorrow';
    setNextRefresh(`Next refresh: ${label}`);
  }, []);

  // ── VIEW ──
  const setView = useCallback((view: ViewType) => {
    setCurrentViewRaw(view);
    if (view !== 'focus') setFocusFilters([]);
  }, []);

  // ── FOCUS FILTERS ──
  const addFocusFilter = useCallback((type: FilterType, value: string) => {
    setFocusFilters((prev) => {
      if (prev.find((f) => f.type === type && f.value === value)) return prev;
      return [...prev, { type, value }];
    });
    setCurrentViewRaw('focus');
  }, []);

  const removeFocusFilter = useCallback((index: number) => {
    setFocusFilters((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        setCurrentViewRaw('priority');
      }
      return next;
    });
  }, []);

  const clearFocusFilters = useCallback(() => {
    setFocusFilters([]);
    setCurrentViewRaw('priority');
  }, []);

  // ── TASK TOGGLE ──
  const toggleTask = useCallback((id: number) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  }, []);

  // ── GENERATED TASK TOGGLE ──
  const toggleGeneratedTask = useCallback((id: string) => {
    setGeneratedTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  }, []);

  // ── VISIBLE TASKS ──
  const visibleTasks = useCallback(() => {
    let pool = tasks.filter((t) => !t.completed);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      pool = pool.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.desc.toLowerCase().includes(q) ||
          t.client.toLowerCase().includes(q) ||
          t.project.toLowerCase().includes(q)
      );
    }
    return pool;
  }, [tasks, searchQuery]);

  const matchesFocus = useCallback(
    (task: Task) =>
      focusFilters.every((f) => {
        if (f.type === 'priority') return task.priority === f.value;
        if (f.type === 'activity') return task.activity === f.value;
        if (f.type === 'client') return task.client === f.value;
        if (f.type === 'project') return task.project === f.value;
        if (f.type === 'date') return getDateBucket(task.dueDate) === f.value;
        return true;
      }),
    [focusFilters]
  );

  // ── ADD TASK ──
  const addTask = () => {
    if (!addTitle.trim()) return;
    const task: Task = {
      id: nextId,
      title: addTitle.trim(),
      desc: addDesc.trim() || '—',
      priority: addPriority,
      activity: addActivity,
      client: addClient.trim() || 'Unassigned',
      project: addProject.trim() || 'Unassigned',
      source: 'Manual',
      dueDate: null,
      completed: false,
      manual: true,
    };
    setTasks((prev) => [task, ...prev]);
    setNextId((n) => n + 1);
    setAddTitle(''); setAddDesc(''); setAddClient(''); setAddProject('');
    setAddModalOpen(false);
  };

  // ── STRATEGY SAVE ──
  const saveStrategy = () => {
    const lines = [strategy1.trim(), strategy2.trim(), strategy3.trim()].filter(Boolean);
    if (lines.length !== 3) return; // Require all 3
    setStrategyItems(lines);
    setStrategyModalOpen(false);
    fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weeklyStrategy: lines }),
    }).catch(console.error);
  };

  // ── REFRESH INSIGHT ──
  const refreshInsight = () => {
    setInsightLoading(true);
    setTimeout(() => {
      setInsightText(generateInsight(tasks, strategyItems));
      setInsightLoading(false);
    }, 800);
  };

  // ── RE-ANALYZE (AI PIPELINE) ──
  const runAIAnalysis = useCallback(() => {
    setAnalyzeLoading(true);
    fetch('/api/ai/analyze', { method: 'POST' })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => Promise.reject(new Error(d.details || d.error || 'Analysis failed')));
        return r.json();
      })
      .then(() => refetchTasks())
      .catch((err) => {
        console.error('[ai]', err);
        alert(err instanceof Error ? err.message : 'AI analysis failed');
      })
      .finally(() => setAnalyzeLoading(false));
  }, [refetchTasks]);

  // ── DERIVED ──
  const openCount = tasks.filter((t) => !t.completed).length;
  const generatedOpenCount = generatedTasks.filter((t) => !t.completed).length;
  const inboxCount = generatedTasks.length > 0 ? generatedOpenCount : Math.min(openCount, INBOX_LIMIT);
  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const viewMeta =
    currentView === 'inbox'
      ? generatedTasks.length > 0
        ? `${inboxCount} action item${inboxCount !== 1 ? 's' : ''} · ${dateStr}`
        : `${inboxCount} surfaced · ${dateStr}`
      : currentView === 'focus' && focusFilters.length > 0
      ? `${tasks.filter((t) => !t.completed && matchesFocus(t)).length} match${tasks.filter((t) => !t.completed && matchesFocus(t)).length !== 1 ? 'es' : ''} · ${focusFilters.length} filter${focusFilters.length !== 1 ? 's' : ''} active`
      : `${openCount} open · ${dateStr}`;

  const chartData = buildChartData(currentView, tasks, strategyItems);

  const handleChartBarClick = useCallback(
    (label: string) => {
      let type: FilterType;
      let value: string;
      if (currentView === 'inbox' || currentView === 'priority') {
        value = PRIORITY_LABEL_TO_VALUE[label] ?? label.toLowerCase();
        type = 'priority';
      } else if (currentView === 'activity') {
        value = ACTIVITY_LABEL_TO_VALUE[label] ?? label.toLowerCase();
        type = 'activity';
      } else if (currentView === 'date') {
        value = label;
        type = 'date';
      } else if (currentView === 'client' || currentView === 'focus') {
        value = label;
        type = 'client';
      } else if (currentView === 'project') {
        value = label;
        type = 'project';
      } else {
        return;
      }
      addFocusFilter(type, value);
    },
    [currentView, addFocusFilter]
  );

  // ── RENDER CONTENT ──
  const renderContent = () => {
    if (currentView === 'inbox') {
      // If AI-generated tasks exist, show them — this is the primary experience
      if (generatedTasks.length > 0) {
        const open = generatedTasks.filter((t) => !t.completed);
        const done = generatedTasks.filter((t) => t.completed);
        const todayItems = open.filter((t) => t.urgency === 'today');
        const thisWeekItems = open.filter((t) => t.urgency === 'this_week');
        const laterItems = open.filter((t) => t.urgency === 'later');

        return (
          <>
            <div className="inbox-header">
              <span className="inbox-ai-label">
                <span className="mi xs">auto_awesome</span>
                AI-generated · {open.length} action item{open.length !== 1 ? 's' : ''}
              </span>
              <span className="inbox-total-label">{done.length} completed</span>
            </div>

            {todayItems.length > 0 && (
              <>
                <div className="group-header">
                  <span className="group-label">
                    <span className="mi xs">bolt</span> Do today
                  </span>
                  <div className="group-line" />
                  <span className="group-count">{todayItems.length}</span>
                </div>
                {todayItems.map((t) => (
                  <GeneratedTaskCard key={t.id} task={t} onToggle={toggleGeneratedTask} />
                ))}
              </>
            )}

            {thisWeekItems.length > 0 && (
              <>
                <div className="group-header">
                  <span className="group-label">
                    <span className="mi xs">calendar_today</span> This week
                  </span>
                  <div className="group-line" />
                  <span className="group-count">{thisWeekItems.length}</span>
                </div>
                {thisWeekItems.map((t) => (
                  <GeneratedTaskCard key={t.id} task={t} onToggle={toggleGeneratedTask} />
                ))}
              </>
            )}

            {laterItems.length > 0 && (
              <>
                <div className="group-header">
                  <span className="group-label">
                    <span className="mi xs">schedule</span> Later
                  </span>
                  <div className="group-line" />
                  <span className="group-count">{laterItems.length}</span>
                </div>
                {laterItems.map((t) => (
                  <GeneratedTaskCard key={t.id} task={t} onToggle={toggleGeneratedTask} />
                ))}
              </>
            )}

            {open.length === 0 && (
              <div className="empty-state">All done. Nice work.</div>
            )}
          </>
        );
      }

      // Fallback: no AI tasks yet — show scored source tasks with prompt to analyze
      const pool = visibleTasks();
      const ranked = pool
        .map((t) => ({ task: t, score: scoreTask(t, strategyItems) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, INBOX_LIMIT);
      if (ranked.length === 0) return <div className="empty-state">All done. Nice work.</div>;
      return (
        <>
          <div className="inbox-header">
            <span className="inbox-ai-label" style={{ color: '#636366' }}>
              <span className="mi xs">info</span>
              Hit "Re-analyze" to generate your AI task list
            </span>
            <span className="inbox-total-label">{pool.length} total open</span>
          </div>
          {ranked.map(({ task }, i) => (
            <TaskCard
              key={task.id}
              task={task}
              rank={i + 1}
              focusFilters={focusFilters}
              onToggle={toggleTask}
              onAddFilter={addFocusFilter}
            />
          ))}
          {pool.length > INBOX_LIMIT && (
            <div className="inbox-overflow-note">
              {pool.length - INBOX_LIMIT} more in Priority, Client, or Date views
            </div>
          )}
        </>
      );
    }

    if (currentView === 'focus') {
      const pool = tasks.filter((t) => matchesFocus(t) && !t.completed);
      if (pool.length === 0)
        return <div className="empty-state">No tasks match these filters.</div>;
      return (
        <>
          <div className="group-header">
            <span className="group-label">
              <span className="mi xs">radio_button_unchecked</span> Open
            </span>
            <div className="group-line" />
            <span className="group-count">{pool.length}</span>
          </div>
          {pool.map((t) => (
            <TaskCard key={t.id} task={t} focusFilters={focusFilters} onToggle={toggleTask} onAddFilter={addFocusFilter} />
          ))}
        </>
      );
    }

    if (currentView === 'date') {
      const pool = visibleTasks();
      const buckets: Record<string, Task[]> = {};
      pool.forEach((t) => {
        const b = getDateBucket(t.dueDate);
        if (!buckets[b]) buckets[b] = [];
        buckets[b].push(t);
      });
      return (
        <>
          {DATE_BUCKET_ORDER.filter((b) => buckets[b]).map((b) => (
            <div key={b}>
              <div className="group-header">
                <span className="group-label">
                  <span className="mi xs">{DATE_BUCKET_ICON[b]}</span> {b}
                </span>
                <div className="group-line" />
                <span className="group-count">{buckets[b].filter((t) => !t.completed).length} open</span>
              </div>
              {buckets[b].map((t) => (
                <TaskCard key={t.id} task={t} focusFilters={focusFilters} onToggle={toggleTask} onAddFilter={addFocusFilter} />
              ))}
            </div>
          ))}
        </>
      );
    }

    // Priority, Activity, Client, Project grouped views
    const keyMap: Record<string, keyof Task> = {
      priority: 'priority', activity: 'activity', client: 'client', project: 'project',
    };
    const groupOrderMap: Record<string, string[]> = {
      priority: ['high', 'medium', 'low'],
      activity: ['email', 'meeting', 'focus', 'other'],
    };
    const key = keyMap[currentView];
    const pool = visibleTasks();
    const groups: Record<string, Task[]> = {};
    pool.forEach((t) => {
      const k = String(t[key]) || 'Other';
      if (!groups[k]) groups[k] = [];
      groups[k].push(t);
    });
    const order = groupOrderMap[currentView];
    const keys = order
      ? order.filter((k) => groups[k])
      : Object.keys(groups).sort();

    return (
      <>
        {keys.map((groupKey) => {
          const items = groups[groupKey];
          const openInGroup = items.filter((t) => !t.completed).length;
          let rawLabel = '';
          if (currentView === 'priority') rawLabel = PRIORITY_LABEL[groupKey] || groupKey;
          else if (currentView === 'activity') rawLabel = ACTIVITY_LABEL[groupKey] || groupKey;
          else if (currentView === 'client') rawLabel = `<span class="mi xs">business</span> ${groupKey}`;
          else rawLabel = `<span class="mi xs">folder</span> ${groupKey}`;

          return (
            <div key={groupKey}>
              <div className="group-header">
                <span
                  className="group-label"
                  dangerouslySetInnerHTML={{ __html: rawLabel }}
                />
                <div className="group-line" />
                <span className="group-count">{openInGroup} open</span>
              </div>
              {items.map((t) => (
                <TaskCard key={t.id} task={t} focusFilters={focusFilters} onToggle={toggleTask} onAddFilter={addFocusFilter} />
              ))}
            </div>
          );
        })}
      </>
    );
  };

  // ── SOURCE DOT COLOR ──
  const sourceDot = (status: string) => {
    if (status === 'connected') return 'dot-green';
    if (status === 'error') return 'dot-red';
    return 'dot-amber'; // disconnected
  };

  return (
    <>
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-section" style={{ paddingTop: 20 }}>
          <div className="sidebar-section-label">Views</div>

          {/* Inbox */}
          <div
            className={`sidebar-item nav-inbox ${currentView === 'inbox' ? 'active' : ''}`}
            onClick={() => setView('inbox')}
          >
            <span className="icon mi sm">auto_awesome</span>
            Inbox
            <span className="count">{inboxCount}</span>
          </div>

          <div className="sidebar-divider" style={{ margin: '6px 0' }} />

          {/* Standard views */}
          {(
            [
              { id: 'priority', icon: 'flag', label: 'Priority' },
              { id: 'activity', icon: 'bolt', label: 'Activity Type' },
              { id: 'client', icon: 'business', label: 'Client' },
              { id: 'project', icon: 'folder', label: 'Project' },
              { id: 'date', icon: 'calendar_today', label: 'Date' },
            ] as { id: ViewType; icon: string; label: string }[]
          ).map(({ id, icon, label }) => (
            <div
              key={id}
              className={`sidebar-item ${currentView === id ? 'active' : ''}`}
              onClick={() => setView(id)}
            >
              <span className="icon mi sm">{icon}</span>
              {label}
              <span className="count">{openCount}</span>
            </div>
          ))}

          {/* Focus View — only shown when filters active */}
          {focusFilters.length > 0 && (
            <div
              className={`sidebar-item ${currentView === 'focus' ? 'active' : ''}`}
              onClick={() => setView('focus')}
            >
              <span className="icon mi sm">center_focus_strong</span>
              Focus View
              <span className="count">
                {tasks.filter((t) => !t.completed && matchesFocus(t)).length}
              </span>
            </div>
          )}
        </div>

        <div className="sidebar-divider" />

        {/* Chart */}
        <div className="sidebar-section">
          <div className="sidebar-section-label">Chart</div>
          <SidebarChart data={chartData} onBarClick={handleChartBarClick} />
        </div>

        <div className="sidebar-divider" />

        {/* Strategy */}
        <div className="sidebar-section">
          <div className="sidebar-section-label">Strategy</div>
          <div className="strategy-block">
            {strategyItems.map((item, i) => (
              <div key={i} className="strategy-item">
                <div className="dot" />
                <span>{item}</span>
              </div>
            ))}
            <button className="strategy-edit-btn" onClick={() => setStrategyModalOpen(true)}>
              <span className="mi xs">edit</span> Edit Strategy
            </button>
          </div>
        </div>

        <div className="sidebar-divider" />

        {/* Insight */}
        <div className="sidebar-section">
          <div className="sidebar-section-label">Insight</div>
          <div className="sidebar-insight-wrap">
            {insightLoading ? (
              <div className="sidebar-insight-loading">
                <div className="insight-dot" />
                <div className="insight-dot" />
                <div className="insight-dot" />
              </div>
            ) : (
              <>
                <div className="sidebar-insight-text">{insightText}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="sidebar-insight-refresh" onClick={refreshInsight}>
                    <span className="mi xs">refresh</span> Refresh
                  </button>
                  <button
                    className="sidebar-insight-refresh"
                    onClick={runAIAnalysis}
                    disabled={analyzeLoading}
                  >
                    {analyzeLoading ? (
                      <>
                        <span className="analyze-spinner" />
                        <span>Analyzing...</span>
                      </>
                    ) : (
                      <>
                        <span className="mi xs">psychology</span> Re-analyze now
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div style={{ marginTop: 'auto', padding: '12px 12px 16px' }}>
          <div style={{ fontSize: 10, color: '#44444a', padding: '0 6px 8px' }}>
            {refreshedAt
              ? `Last refreshed: ${new Date(refreshedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
              : 'Loading…'}
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              width: '100%',
              padding: '7px 8px',
              background: 'none',
              border: 'none',
              borderRadius: 7,
              cursor: 'pointer',
              color: '#636366',
              fontSize: 12,
              fontFamily: 'inherit',
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#1e1e20';
              e.currentTarget.style.color = '#8e8e99';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.color = '#636366';
            }}
          >
            <span className="mi xs">logout</span>
            Sign out
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div className="main">
        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-left">
            <div className="topbar-meta">{viewMeta}</div>
          </div>
          <div className="topbar-actions">
            {/* Search */}
            <div className={`search-wrap ${searchOpen ? 'open' : ''}`}>
              <button
                className="search-btn-inner"
                onClick={() => {
                  setSearchOpen((v) => !v);
                  if (!searchOpen) setTimeout(() => searchInputRef.current?.focus(), 150);
                  else setSearchQuery('');
                }}
              >
                <span className="mi sm">search</span>
              </button>
              <input
                ref={searchInputRef}
                className="search-input-field"
                placeholder="Search tasks…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); }
                }}
              />
            </div>
            <button className="btn-icon-add" onClick={() => setAddModalOpen(true)}>
              <span className="mi sm">add</span>
            </button>
          </div>
        </div>

        {/* Source status bar */}
        <div className="refresh-bar">
          <div className="refresh-sources">
            {Object.entries(sourceStatus).map(([name, status]) => {
              const isGranolaDisconnected = name === 'granola' && status === 'disconnected';
              const label = name.charAt(0).toUpperCase() + name.slice(1);
              const count = sourceCounts[name] ?? 0;
              const countLabel = status === 'connected' ? ` · ${count}` : '';
              return isGranolaDisconnected ? (
                <a
                  key={name}
                  href="/api/granola/connect"
                  className="source-chip source-chip-link"
                >
                  <div className={`dot ${sourceDot(status)}`} />
                  {label} · Connect
                </a>
              ) : (
                <div key={name} className="source-chip">
                  <div className={`dot ${sourceDot(status)}`} />
                  {label}{countLabel}
                </div>
              );
            })}
          </div>
          <div className="next-refresh">
            {nextRefresh}
            {process.env.NODE_ENV === 'development' && (
              <a
                href="/api/debug/sources"
                target="_blank"
                rel="noopener noreferrer"
                style={{ marginLeft: 12, fontSize: 11, color: '#636366' }}
              >
                Debug sources
              </a>
            )}
          </div>
        </div>

        {/* Focus bar */}
        {focusFilters.length > 0 && (
          <div className="focus-bar visible">
            <span className="focus-bar-label">
              <span className="mi xs">center_focus_strong</span> Filtering by
            </span>
            {focusFilters.map((f, i) => {
              const valStr =
                f.type === 'priority' || f.type === 'activity'
                  ? f.value.charAt(0).toUpperCase() + f.value.slice(1)
                  : f.value;
              return (
                <span key={i} className="focus-chip">
                  {FILTER_TYPE_LABEL[f.type]}: {valStr}
                  <span
                    className="focus-chip-remove"
                    onClick={() => removeFocusFilter(i)}
                  >
                    close
                  </span>
                </span>
              );
            })}
            <button className="focus-clear-btn" onClick={clearFocusFilters}>
              <span className="mi xs">close</span> Clear all
            </button>
          </div>
        )}

        {/* Content */}
        <div className="content">
          {tasks.length === 0 ? (
            <div className="empty-state">Loading…</div>
          ) : (
            renderContent()
          )}
        </div>
      </div>

      {/* Strategy Modal */}
      <div
        className={`modal-overlay ${strategyModalOpen ? 'open' : ''}`}
        onClick={(e) => { if (e.target === e.currentTarget) setStrategyModalOpen(false); }}
      >
        <div className="modal">
          <div className="modal-title">Weekly Strategy</div>
          <div className="modal-subtitle">
            What are your 3 top priorities this week? The system uses these to rank and surface
            what matters most.
          </div>
          <div className="strategy-fields">
            <input
              className="modal-input"
              placeholder="1. e.g. Launch Bissell — connect systems, support sales, schedule kickoffs"
              value={strategy1}
              onChange={(e) => setStrategy1(e.target.value)}
            />
            <input
              className="modal-input"
              placeholder="2. e.g. Advance Geo and Cantoo — write SOWs, create in HubSpot"
              value={strategy2}
              onChange={(e) => setStrategy2(e.target.value)}
            />
            <input
              className="modal-input"
              placeholder="3. e.g. Keep the business running — clear accounting, marketing, ops"
              value={strategy3}
              onChange={(e) => setStrategy3(e.target.value)}
            />
          </div>
          <div className="modal-actions">
            <button className="btn-cancel" onClick={() => setStrategyModalOpen(false)}>
              Cancel
            </button>
            <button className="btn-save" onClick={saveStrategy}>
              Save Strategy
            </button>
          </div>
        </div>
      </div>

      {/* Add Task Modal */}
      <div
        className={`modal-overlay ${addModalOpen ? 'open' : ''}`}
        onClick={(e) => { if (e.target === e.currentTarget) setAddModalOpen(false); }}
      >
        <div className="modal">
          <div className="modal-title">Add Task</div>
          <div className="modal-subtitle">
            Manually add something the system hasn&apos;t picked up yet.
          </div>
          <input
            className="modal-input"
            placeholder="Task title"
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
          />
          <textarea
            className="modal-textarea"
            placeholder="Description (optional)"
            value={addDesc}
            onChange={(e) => setAddDesc(e.target.value)}
            rows={3}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <select
              className="modal-select"
              value={addPriority}
              onChange={(e) => setAddPriority(e.target.value as Task['priority'])}
            >
              <option value="high">🔴 High Priority</option>
              <option value="medium">🟡 Medium Priority</option>
              <option value="low">🟢 Low Priority</option>
            </select>
            <select
              className="modal-select"
              value={addActivity}
              onChange={(e) => setAddActivity(e.target.value as Task['activity'])}
            >
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
              <option value="focus">Focus Time</option>
              <option value="other">Other</option>
            </select>
            <input
              className="modal-input"
              style={{ margin: 0 }}
              placeholder="Client"
              value={addClient}
              onChange={(e) => setAddClient(e.target.value)}
            />
            <input
              className="modal-input"
              style={{ margin: 0 }}
              placeholder="Project Name"
              value={addProject}
              onChange={(e) => setAddProject(e.target.value)}
            />
          </div>
          <div className="modal-actions">
            <button className="btn-cancel" onClick={() => setAddModalOpen(false)}>
              Cancel
            </button>
            <button className="btn-save" onClick={addTask}>
              Add Task
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="empty-state">Loading…</div>}>
      <DashboardContent />
    </Suspense>
  );
}
