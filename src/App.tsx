import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  Bookmark,
  CheckCheck,
  ChevronDown,
  Inbox,
  LoaderCircle,
  LogOut,
  Menu,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from 'lucide-react';
import type { AppConfig, CollectionItem, ContentType } from '../shared/types';
import { api } from './lib/api';
import { filterItems, itemInput, typeLabels } from './lib/content';
import { useCollection } from './hooks/useCollection';
import { ContentIcon } from './components/Icon';
import { ItemCard } from './components/ItemCard';
import { ItemEditor } from './components/ItemEditor';
import { ItemDetail } from './components/ItemDetail';
import { Login } from './components/Login';
export function App() {
  const [config, setConfig] = useState<AppConfig>();
  const [configError, setConfigError] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState('all');
  const [type, setType] = useState('');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState('newest');
  const [editor, setEditor] = useState<{ item?: CollectionItem; type?: ContentType }>();
  const [selectedId, setSelectedId] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [busyIds, setBusyIds] = useState(new Set<string>());
  const [toast, setToast] = useState('');
  const collection = useCollection(Boolean(config?.authenticated));
  const selected = collection.items.find((item) => item.id === selectedId);
  async function loadConfig() {
    setConfigError('');
    try {
      setConfig(await api.config());
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : '服务暂不可用');
    }
  }
  useEffect(() => {
    void loadConfig();
    const expired = () => {
      setConfig((current) => (current ? { ...current, authenticated: false } : current));
      setEditor(undefined);
      setSelectedId('');
    };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!sidebarOpen) return;
    const sidebar = sidebarRef.current;
    const menu = menuRef.current;
    if (!sidebar) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = () =>
      [...sidebar.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)')].filter(
        (element) => element.getClientRects().length > 0,
      );
    const focusFrame = requestAnimationFrame(() => controls()[0]?.focus({ preventScroll: true }));
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setSidebarOpen(false);
      if (event.key !== 'Tab') return;
      const elements = controls();
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    const desktop = window.matchMedia('(min-width: 761px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setSidebarOpen(false);
    };
    closeOnDesktop();
    desktop.addEventListener('change', closeOnDesktop);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      cancelAnimationFrame(focusFrame);
      desktop.removeEventListener('change', closeOnDesktop);
      document.removeEventListener('keydown', handleKey);
      menu?.focus();
    };
  }, [sidebarOpen]);
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    collection.items.forEach((item) =>
      item.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)),
    );
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'));
  }, [collection.items]);
  const filtered = useMemo(() => {
    const result = filterItems(collection.items, {
      query,
      type,
      tag,
      status: view === 'unread' || view === 'done' ? view : '',
      starred: view === 'starred',
    });
    return sort === 'oldest' ? result.reverse() : result;
  }, [collection.items, query, type, tag, view, sort]);
  const navItems = [
    { id: 'all', label: '全部收藏', icon: Inbox, count: collection.items.length },
    {
      id: 'unread',
      label: '留着看',
      icon: Bookmark,
      count: collection.items.filter((item) => item.status === 'unread').length,
    },
    {
      id: 'done',
      label: '看过了',
      icon: CheckCheck,
      count: collection.items.filter((item) => item.status === 'done').length,
    },
    {
      id: 'starred',
      label: '星标收藏',
      icon: Star,
      count: collection.items.filter((item) => item.starred).length,
    },
  ];
  async function updateItem(item: CollectionItem, field: 'status' | 'starred') {
    if (busyIds.has(item.id)) return;
    setBusyIds((current) => new Set(current).add(item.id));
    try {
      await collection.save(
        {
          ...itemInput(item),
          ...(field === 'status'
            ? { status: item.status === 'done' ? 'unread' : 'done' }
            : { starred: !item.starred }),
        },
        item.id,
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : '操作失败');
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }
  if (configError)
    return (
      <main className="service-error">
        <h1>暂时无法打开收好</h1>
        <p>{configError}</p>
        <button className="button button--primary" onClick={() => void loadConfig()}>
          重新连接
        </button>
      </main>
    );
  if (!config)
    return (
      <main className="service-error">
        <LoaderCircle size={26} className="spin" aria-label="正在加载" />
      </main>
    );
  if (!config.authenticated) return <Login onSuccess={() => void loadConfig()} />;
  return (
    <div className="workspace">
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="关闭菜单"
          tabIndex={-1}
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        id="collection-sidebar"
        ref={sidebarRef}
        className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}
        role={sidebarOpen ? 'dialog' : undefined}
        aria-modal={sidebarOpen ? true : undefined}
        aria-label="收藏菜单"
      >
        <button
          className="icon-button sidebar__close"
          aria-label="收起菜单"
          onClick={() => setSidebarOpen(false)}
        >
          <X size={20} />
        </button>
        <a className="brand" href="/" aria-label="收好首页">
          <span className="brand__mark">
            <Bookmark size={23} strokeWidth={1.5} />
          </span>
          <span>
            收好<small>SHOUHAO</small>
          </span>
        </a>
        <button
          className="button button--primary sidebar__add"
          onClick={() => {
            setEditor({});
            setSidebarOpen(false);
          }}
        >
          <Plus size={18} />
          添加收藏<kbd>N</kbd>
        </button>
        <nav className="sidebar__nav" aria-label="收藏导航">
          {navItems.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              className={`nav-item ${view === id && !tag ? 'nav-item--active' : ''}`}
              onClick={() => {
                setView(id);
                setTag('');
                setSidebarOpen(false);
              }}
            >
              <Icon size={19} strokeWidth={1.6} />
              <span>{label}</span>
              <small>{count}</small>
            </button>
          ))}
        </nav>
        <div className="sidebar__divider" />
        <div className="sidebar__section-heading">
          <span>我的标签</span>
          <span>{tags.length}</span>
        </div>
        <div className="sidebar__tags">
          {tags.length ? (
            tags.map(([value, count]) => (
              <button
                className={`tag-nav ${tag === value ? 'tag-nav--active' : ''}`}
                key={value}
                onClick={() => {
                  setTag(tag === value ? '' : value);
                  setView('all');
                  setSidebarOpen(false);
                }}
              >
                <span className="tag-nav__hash">#</span>
                <span>{value}</span>
                <small>{count}</small>
              </button>
            ))
          ) : (
            <p>
              收藏时添加标签，
              <br />
              以后更容易找到。
            </p>
          )}
        </div>
        <div className="sidebar__mascot">
          <img src="/mascot.png" alt="抱着收藏的小本子" />
          <span>喜欢的，帮你收好。</span>
        </div>
        <div className="sidebar__bottom">
          <a href="/api/export" className="text-button" download>
            <ArrowDownToLine size={16} />
            导出收藏
          </a>
          {config.requiresPassword && (
            <button
              className="icon-button"
              aria-label="退出"
              onClick={() =>
                void api
                  .logout()
                  .then(loadConfig)
                  .catch((error) => setToast(error.message))
              }
            >
              <LogOut size={16} />
            </button>
          )}
          <span>一点一点，留下喜欢的。</span>
        </div>
      </aside>
      <main className="main" inert={sidebarOpen}>
        <header className="topbar">
          <div className="topbar__breadcrumb">
            <button
              className="icon-button mobile-menu"
              ref={menuRef}
              aria-label="打开菜单"
              aria-expanded={sidebarOpen}
              aria-controls="collection-sidebar"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={22} />
            </button>
            <span>我的收藏</span>
            <span className="topbar__slash">/</span>
            <span>{tag ? `#${tag}` : navItems.find((item) => item.id === view)?.label}</span>
          </div>
          <div className="topbar__right">
            <span className="topbar__count">{collection.items.length} 件收藏</span>
            <button className="button button--primary mobile-add" onClick={() => setEditor({})}>
              <Plus size={17} />
              收藏
            </button>
            <span className="avatar" aria-hidden="true">
              藏
            </span>
          </div>
        </header>
        <section className="collection">
          <div className="collection__heading">
            <div>
              <p className="eyebrow">YOUR LITTLE COLLECTION</p>
              <h1>{tag ? `#${tag}` : navItems.find((item) => item.id === view)?.label}</h1>
              <p className="collection__subtitle">
                {view === 'unread'
                  ? '有空的时候，再慢慢看。'
                  : view === 'done'
                    ? '读过、听过、看过，都在这里。'
                    : view === 'starred'
                      ? '那些想要再翻一遍的。'
                      : '喜欢的内容，值得好好留下。'}
              </p>
            </div>
            <button className="collection__quick-note" onClick={() => setEditor({ type: 'note' })}>
              <ContentIcon type="note" size={18} />
              <span>记个想法</span>
            </button>
          </div>
          <div className="collection__toolbar">
            <div className="search">
              <Search size={19} />
              <input
                aria-label="搜索收藏"
                placeholder="搜索标题、内容或标签…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button className="icon-button" onClick={() => setQuery('')} aria-label="清空搜索">
                  <X size={15} />
                </button>
              )}
            </div>
            <div className="sort-select">
              <SlidersHorizontal size={16} />
              <select
                aria-label="排序"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="newest">最近收藏</option>
                <option value="oldest">最早收藏</option>
              </select>
              <ChevronDown size={14} />
            </div>
          </div>
          <div className="collection__filters">
            <div className="type-filters" role="group" aria-label="内容类型">
              <button className={!type ? 'is-active' : ''} onClick={() => setType('')}>
                全部
              </button>
              {(['article', 'video', 'audio', 'webpage', 'note', 'image'] as const).map((value) => (
                <button
                  key={value}
                  className={type === value ? 'is-active' : ''}
                  onClick={() => setType(value)}
                >
                  <ContentIcon type={value} />
                  {typeLabels[value]}
                </button>
              ))}
            </div>
            <span className="result-count">{filtered.length} 件</span>
          </div>
          {tag && (
            <button className="selected-tag" onClick={() => setTag('')}>
              #{tag}
              <X size={13} />
            </button>
          )}
          {collection.loading ? (
            <div className="empty-state">
              <LoaderCircle className="spin" size={25} />
              <p>正在打开收藏…</p>
            </div>
          ) : collection.error ? (
            <div className="empty-state">
              <p className="error">{collection.error}</p>
              <button className="button button--secondary" onClick={() => void collection.reload()}>
                重试
              </button>
            </div>
          ) : filtered.length ? (
            <div className="card-grid">
              {filtered.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onOpen={() => setSelectedId(item.id)}
                  onStatus={() => void updateItem(item, 'status')}
                  onStar={() => void updateItem(item, 'starred')}
                  busy={busyIds.has(item.id)}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <img className="empty-state__mascot" src="/mascot.png" alt="等待第一件收藏的小本子" />
              <h2>{collection.items.length ? '还没有符合条件的收藏' : '第一件收藏，从喜欢开始'}</h2>
              <p>
                {collection.items.length
                  ? '换个关键词，或试试其他筛选条件。'
                  : '一篇文章、一段视频，或刚刚闪过的想法。'}
              </p>
              {collection.items.length ? (
                <button
                  className="button button--secondary"
                  onClick={() => {
                    setQuery('');
                    setType('');
                    setTag('');
                    setView('all');
                  }}
                >
                  清除筛选
                </button>
              ) : (
                <button className="button button--primary" onClick={() => setEditor({})}>
                  <Plus size={17} />
                  添加第一件收藏
                </button>
              )}
            </div>
          )}
          {filtered.length > 0 && (
            <footer className="collection__footer">
              <span className="hand-dash" />
              <span>慢慢收集，慢慢看。</span>
              <span className="hand-dash" />
            </footer>
          )}
        </section>
      </main>
      {editor && (
        <ItemEditor
          item={editor.item}
          initialType={editor.type}
          aiEnabled={config.aiEnabled}
          onClose={() => setEditor(undefined)}
          onSave={async (input, id) => {
            const item = await collection.save(input, id);
            setToast(id ? '修改已保存' : '已收藏');
            return item;
          }}
        />
      )}
      {selected && !editor && (
        <ItemDetail
          item={selected}
          onClose={() => setSelectedId('')}
          onEdit={() => {
            setEditor({ item: selected });
            setSelectedId('');
          }}
          onSave={collection.save}
          onRemove={collection.remove}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      <KeyboardShortcut onAdd={() => setEditor({})} />
    </div>
  );
}
function KeyboardShortcut({ onAdd }: { onAdd: () => void }) {
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        event.key.toLowerCase() === 'n' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !target.closest('input, textarea, select, [contenteditable], dialog')
      ) {
        event.preventDefault();
        onAdd();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onAdd]);
  return null;
}
