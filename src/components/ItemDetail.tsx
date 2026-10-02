import { Check, ExternalLink, Pencil, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { CollectionItem, ItemInput } from '../../shared/types';
import { Dialog } from './Dialog';
import { ContentIcon } from './Icon';
import { formatDate, itemInput, typeLabels } from '../lib/content';
interface Props {
  item: CollectionItem;
  onClose: () => void;
  onEdit: () => void;
  onSave: (input: ItemInput, id?: string) => Promise<CollectionItem>;
  onRemove: (id: string) => Promise<void>;
}
export function ItemDetail({ item, onClose, onEdit, onSave, onRemove }: Props) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function action(run: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await run();
    } catch (error) {
      setError(error instanceof Error ? error.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="收藏详情" onClose={onClose} className="detail-dialog">
      <div className="detail">
        {item.cover && (
          <img
            className="detail__cover"
            src={item.cover}
            alt={item.type === 'image' ? item.title : '封面'}
            referrerPolicy="no-referrer"
          />
        )}
        <div className="detail__meta">
          <span>
            <ContentIcon type={item.type} />
            {typeLabels[item.type]}
          </span>
          <span>{item.source || '我的收藏'}</span>
          {item.author && <span>{item.author}</span>}
          <span>{formatDate(item.createdAt)}</span>
        </div>
        <h3>{item.title}</h3>
        {item.description && <p className="detail__description">{item.description}</p>}
        {item.content && <div className="detail__content">{item.content}</div>}
        <div className="item-card__tags">
          {item.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
        {item.url && (
          <a
            className="button button--primary detail__open"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={17} />
            打开原内容
          </a>
        )}
        <div className="detail__actions">
          <button
            className="button button--secondary"
            disabled={busy}
            onClick={() =>
              void action(() =>
                onSave(
                  { ...itemInput(item), status: item.status === 'done' ? 'unread' : 'done' },
                  item.id,
                ),
              )
            }
          >
            <Check size={16} />
            {item.status === 'done' ? '标为待看' : '标为看过'}
          </button>
          <button
            className={`button button--secondary ${item.starred ? 'is-starred' : ''}`}
            disabled={busy}
            onClick={() =>
              void action(() => onSave({ ...itemInput(item), starred: !item.starred }, item.id))
            }
          >
            <Star size={16} fill={item.starred ? 'currentColor' : 'none'} />
            {item.starred ? '取消星标' : '星标'}
          </button>
          <button className="button button--secondary" onClick={onEdit}>
            <Pencil size={16} />
            编辑
          </button>
          <button
            className="icon-button detail__delete"
            aria-label="删除收藏"
            onClick={() => setConfirm(true)}
          >
            <Trash2 size={18} />
          </button>
        </div>
        {confirm && (
          <div className="delete-confirm">
            <span>确定删除这条收藏？</span>
            <button
              className="button button--danger"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await onRemove(item.id);
                  onClose();
                })
              }
            >
              确定删除
            </button>
            <button className="text-button" onClick={() => setConfirm(false)}>
              取消
            </button>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
