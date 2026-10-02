import { Check, ExternalLink, Star } from 'lucide-react';
import { useState } from 'react';
import type { CollectionItem } from '../../shared/types';
import { ContentIcon } from './Icon';
import { formatDate, typeLabels } from '../lib/content';
interface Props {
  item: CollectionItem;
  onOpen: () => void;
  onStatus: () => void;
  onStar: () => void;
  busy: boolean;
}
export function ItemCard({ item, onOpen, onStatus, onStar, busy }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <article
      className={`item-card item-card--${item.type} ${item.status === 'done' ? 'item-card--done' : ''}`}
    >
      <button className="item-card__main" onClick={onOpen} aria-label={`查看 ${item.title}`}>
        {item.cover && !imageFailed ? (
          <div
            className={`item-card__cover ${item.type === 'image' ? 'item-card__cover--image' : ''}`}
          >
            <img
              src={item.cover}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
            />
            {['video', 'audio'].includes(item.type) && (
              <span className="item-card__play">
                <ContentIcon type={item.type} size={22} />
              </span>
            )}
          </div>
        ) : (
          <div className="item-card__text-preview">
            {item.type === 'note' ? (
              <p>{item.content}</p>
            ) : (
              <>
                <ContentIcon type={item.type} size={30} />
                <span>{item.source || typeLabels[item.type]}</span>
              </>
            )}
          </div>
        )}
        <div className="item-card__body">
          <div className="item-card__meta">
            <span>
              <ContentIcon type={item.type} />
              {typeLabels[item.type]}
            </span>
            <span>{formatDate(item.createdAt)}</span>
          </div>
          <h3>{item.title}</h3>
          {item.description && <p className="item-card__description">{item.description}</p>}
          <div className="item-card__tags">
            {item.tags.slice(0, 3).map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        </div>
      </button>
      <div className="item-card__footer">
        <button
          className={`status-button ${item.status === 'done' ? 'is-done' : ''}`}
          onClick={onStatus}
          disabled={busy}
          aria-label={`${item.status === 'done' ? '标为待看' : '标为看过'} ${item.title}`}
        >
          <span className="status-button__circle">
            {item.status === 'done' && <Check size={11} />}
          </span>
          {item.status === 'done' ? '看过了' : '留着看'}
        </button>
        <div>
          <button
            className={`icon-button ${item.starred ? 'is-starred' : ''}`}
            onClick={onStar}
            disabled={busy}
            aria-label={`${item.starred ? '取消星标' : '添加星标'} ${item.title}`}
          >
            <Star size={17} fill={item.starred ? 'currentColor' : 'none'} />
          </button>
          {item.url && (
            <a
              className="icon-button"
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`打开原文 ${item.title}`}
            >
              <ExternalLink size={17} />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
