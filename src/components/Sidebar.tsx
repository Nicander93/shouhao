import { useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowDownToLine, Bookmark, LogOut, Plus, X, type LucideIcon } from 'lucide-react';

export interface SidebarNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  count: number;
}

interface SidebarProps {
  open: boolean;
  sidebarRef: RefObject<HTMLElement | null>;
  view: string;
  tag: string;
  navItems: SidebarNavItem[];
  tags: [string, number][];
  requiresPassword: boolean;
  onClose: () => void;
  onAdd: () => void;
  onSelectView: (id: string) => void;
  onSelectTag: (value: string) => void;
  onLogout: () => void;
}

export function useSidebarDialog() {
  const [open, setOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    // 手机上侧栏是对话框：锁住背景滚动，Tab 只在侧栏内循环；回到桌面宽度时关掉。
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
      if (event.key === 'Escape') setOpen(false);
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
      if (desktop.matches) setOpen(false);
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
  }, [open]);

  return { open, setOpen, sidebarRef, menuRef };
}

export function Sidebar({
  open,
  sidebarRef,
  view,
  tag,
  navItems,
  tags,
  requiresPassword,
  onClose,
  onAdd,
  onSelectView,
  onSelectTag,
  onLogout,
}: SidebarProps) {
  return (
    <>
      {open && (
        <button className="sidebar-scrim" aria-label="关闭菜单" tabIndex={-1} onClick={onClose} />
      )}
      <aside
        id="collection-sidebar"
        ref={sidebarRef}
        className={`sidebar ${open ? 'sidebar--open' : ''}`}
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        aria-label="收藏菜单"
      >
        <button className="icon-button sidebar__close" aria-label="收起菜单" onClick={onClose}>
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
        <button className="button button--primary sidebar__add" onClick={onAdd}>
          <Plus size={18} />
          添加收藏<kbd>N</kbd>
        </button>
        <nav className="sidebar__nav" aria-label="收藏导航">
          {navItems.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              className={`nav-item ${view === id && !tag ? 'nav-item--active' : ''}`}
              onClick={() => onSelectView(id)}
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
                onClick={() => onSelectTag(value)}
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
          {requiresPassword && (
            <button className="icon-button" aria-label="退出" onClick={onLogout}>
              <LogOut size={16} />
            </button>
          )}
          <span>一点一点，留下喜欢的。</span>
        </div>
      </aside>
    </>
  );
}
