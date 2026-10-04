import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Link, LoaderCircle, Sparkles, X } from 'lucide-react';
import type { CollectionItem, ContentType, ItemInput, LinkPreview } from '../../shared/types';
import { Dialog } from './Dialog';
import { api } from '../lib/api';
import { emptyItem, itemInput, readImage, typeLabels } from '../lib/content';
interface Props {
  item?: CollectionItem;
  initialType?: ContentType;
  aiEnabled: boolean;
  onClose: () => void;
  onSave: (input: ItemInput, id?: string) => Promise<CollectionItem>;
}
export function ItemEditor({ item, initialType, aiEnabled, onClose, onSave }: Props) {
  const [form, setForm] = useState<ItemInput>(item ? itemInput(item) : emptyItem(initialType));
  const [mode, setMode] = useState<'link' | 'note' | 'image'>(
    item?.type === 'note'
      ? 'note'
      : item?.type === 'image'
        ? 'image'
        : initialType === 'note'
          ? 'note'
          : initialType === 'image'
            ? 'image'
            : 'link',
  );
  const [linkText, setLinkText] = useState(item?.url || '');
  const [tagText, setTagText] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [suggestion, setSuggestion] = useState<Awaited<ReturnType<typeof api.organize>>>();
  const abort = useRef<AbortController | null>(null);
  const editedFields = useRef(new Set<keyof ItemInput>());
  const lastPreview = useRef<LinkPreview | undefined>(item);
  const identifiedText = useRef('');
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => abort.current?.abort(), []);
  function update<K extends keyof ItemInput>(key: K, value: ItemInput[K]) {
    editedFields.current.add(key);
    setForm((current) => ({ ...current, [key]: value }));
  }
  function switchMode(next: typeof mode) {
    abort.current?.abort();
    setMode(next);
    setForm(emptyItem(next === 'link' ? 'webpage' : next));
    setLinkText('');
    setSuggestion(undefined);
    setNotice('');
    setError('');
    editedFields.current.clear();
    lastPreview.current = undefined;
    identifiedText.current = '';
  }
  function changeLink(text: string) {
    abort.current?.abort();
    setLinkText(text);
    setNotice('');
    setError('');
    setSuggestion(undefined);
    identifiedText.current = '';
    if (busy === 'preview') setBusy('');
  }
  async function identify(text = linkText) {
    setBusy('preview');
    setError('');
    setNotice('');
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    try {
      const preview = await api.preview(text, controller.signal);
      if (controller.signal.aborted) return;
      const previousPreview = lastPreview.current;
      lastPreview.current = preview;
      identifiedText.current = text;
      setForm((current) => {
        const next = { ...current, url: preview.url };
        for (const key of ['title', 'description', 'cover', 'source', 'author'] as const) {
          if (
            !editedFields.current.has(key) &&
            (preview[key] ||
              (preview.url !== previousPreview?.url && current[key] === previousPreview?.[key]))
          )
            next[key] = preview[key];
        }
        if (!editedFields.current.has('type')) next.type = preview.type;
        if (!editedFields.current.has('tags')) {
          next.tags = [
            ...new Set([
              ...current.tags.filter((tag) => !previousPreview?.tags.includes(tag)),
              ...preview.tags,
            ]),
          ].slice(0, 20);
        }
        return next;
      });
      setNotice(preview.warning || '已自动提取标题、封面等信息，可修改后收藏');
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '识别失败');
    } finally {
      if (abort.current === controller && !controller.signal.aborted) setBusy('');
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy('upload');
    setError('');
    try {
      const data = await readImage(file);
      const result = await api.upload(data, file.name);
      update('cover', result.url);
      if (!form.title) update('title', file.name.replace(/\.[^.]+$/, ''));
    } catch (error) {
      setError(error instanceof Error ? error.message : '上传失败');
    } finally {
      setBusy('');
    }
  }
  async function organize() {
    setBusy('ai');
    setError('');
    abort.current?.abort();
    abort.current = new AbortController();
    try {
      setSuggestion(
        await api.organize(
          { title: form.title, content: form.content, description: form.description },
          abort.current.signal,
        ),
      );
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        setError(error instanceof Error ? error.message : '整理失败');
    } finally {
      setBusy('');
    }
  }
  function addTags(text: string) {
    const tags = text
      .split(/[,，\n]/)
      .map((tag) => tag.trim().replace(/^#/, ''))
      .filter(Boolean);
    update('tags', [...new Set([...form.tags, ...tags])].slice(0, 20));
    setTagText('');
  }
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!form.title.trim()) {
      setError('请填写标题');
      return;
    }
    if (mode === 'image' && !form.cover) {
      setError('请选择图片');
      return;
    }
    if (mode === 'note' && !form.content.trim()) {
      setError('请填写速记内容');
      return;
    }
    const tags = [
      ...new Set([
        ...form.tags,
        ...tagText
          .split(/[,，\n]/)
          .map((value) => value.trim().replace(/^#/, ''))
          .filter(Boolean),
      ]),
    ].slice(0, 20);
    const payload = { ...form, title: form.title.trim(), tags };
    if (mode === 'link') {
      const match = linkText.match(/https?:\/\/[^\s<>"“”]+/i);
      if (!match) {
        setError('请填写链接');
        return;
      }
      payload.url =
        identifiedText.current === linkText
          ? form.url
          : match[0].replace(/[，。；、）)\]】]+$/g, '');
    }
    setBusy('save');
    try {
      await onSave(payload, item?.id);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : '保存失败');
    } finally {
      setBusy('');
    }
  }
  return (
    <Dialog title={item ? '编辑收藏' : '添加收藏'} onClose={onClose} className="editor-dialog">
      {!item && (
        <div className="editor__tabs" role="tablist" aria-label="收藏方式">
          {(['link', 'note', 'image'] as const).map((value) => (
            <button
              type="button"
              role="tab"
              aria-selected={mode === value}
              key={value}
              onClick={() => switchMode(value)}
              disabled={Boolean(busy)}
            >
              {value === 'link' ? '链接' : value === 'note' ? '速记' : '图片'}
            </button>
          ))}
        </div>
      )}
      <form className="editor" onSubmit={submit}>
        {mode === 'link' && (
          <div className="field">
            <label htmlFor="link">链接或分享文字</label>
            <div className="link-input">
              <textarea
                id="link"
                rows={2}
                value={linkText}
                onChange={(event) => changeLink(event.target.value)}
                onPaste={(event) => {
                  if (item) return;
                  const pasted = event.clipboardData.getData('text');
                  const input = event.currentTarget;
                  const text =
                    linkText.slice(0, input.selectionStart) +
                    pasted +
                    linkText.slice(input.selectionEnd);
                  if (!/https?:\/\//i.test(text) || text.length > 6000) return;
                  event.preventDefault();
                  changeLink(text);
                  void identify(text);
                }}
                placeholder="粘贴链接，也可以粘贴 App 的分享文字"
                maxLength={6000}
                required
                disabled={Boolean(busy) && busy !== 'preview'}
              />
              <button
                type="button"
                className="button button--secondary"
                onClick={() => void identify()}
                disabled={Boolean(busy) || !linkText.trim()}
              >
                {busy === 'preview' ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Link size={16} />
                )}
                {busy === 'preview' ? '正在识别…' : '识别'}
              </button>
            </div>
            <small>粘贴后自动提取标题、标签、封面和作者；手动修改的字段会保留。</small>
          </div>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {mode === 'image' && (
          <>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              ref={fileRef}
              onChange={(event) => {
                void upload(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <button
              type="button"
              className="image-picker"
              onClick={() => fileRef.current?.click()}
              disabled={Boolean(busy)}
            >
              {form.cover ? (
                <img src={form.cover} alt="已选择的图片" />
              ) : (
                <>
                  <ImagePlus size={30} />
                  <span>{busy === 'upload' ? '正在上传…' : '选择图片'}</span>
                  <small>PNG、JPG、WebP、GIF · 最多 8 MB</small>
                </>
              )}
            </button>
          </>
        )}
        <div className="field">
          <label htmlFor="title">标题</label>
          <input
            id="title"
            value={form.title}
            onChange={(event) => update('title', event.target.value)}
            placeholder={mode === 'note' ? '给这段想法起个名字' : '收藏标题'}
            maxLength={300}
            required
          />
        </div>
        {mode === 'note' && (
          <div className="field">
            <label htmlFor="content">速记内容</label>
            <textarea
              id="content"
              rows={6}
              value={form.content}
              onChange={(event) => update('content', event.target.value)}
              placeholder="记下现在的想法…"
              maxLength={100_000}
              required
            />
          </div>
        )}
        <div className="field">
          <label htmlFor="description">{mode === 'note' ? '摘要（可选）' : '描述 / 备注'}</label>
          <textarea
            id="description"
            rows={3}
            value={form.description}
            onChange={(event) => update('description', event.target.value)}
            placeholder="为什么想留下它？"
            maxLength={5000}
          />
        </div>
        {mode === 'link' && (
          <>
            <div className="editor__row">
              <div className="field">
                <label htmlFor="type">内容类型</label>
                <select
                  id="type"
                  value={form.type}
                  onChange={(event) => update('type', event.target.value as ContentType)}
                >
                  {(['webpage', 'article', 'video', 'audio'] as const).map((type) => (
                    <option value={type} key={type}>
                      {typeLabels[type]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="author">作者（可选）</label>
                <input
                  id="author"
                  value={form.author}
                  onChange={(event) => update('author', event.target.value)}
                  maxLength={200}
                />
              </div>
            </div>
            <details className="editor__extra">
              <summary>来源与封面</summary>
              <div className="field">
                <label htmlFor="source">来源</label>
                <input
                  id="source"
                  value={form.source}
                  onChange={(event) => update('source', event.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="field">
                <label htmlFor="cover">封面链接</label>
                <input
                  id="cover"
                  value={form.cover}
                  onChange={(event) => update('cover', event.target.value)}
                  placeholder="https://…"
                  maxLength={2048}
                />
              </div>
            </details>
            {form.cover && (
              <img
                className="editor__cover"
                src={form.cover}
                alt="封面预览"
                referrerPolicy="no-referrer"
              />
            )}
          </>
        )}
        <div className="field">
          <label htmlFor="tags">标签</label>
          <div className="tag-editor">
            {form.tags.map((tag) => (
              <span key={tag}>
                #{tag}
                <button
                  type="button"
                  onClick={() =>
                    update(
                      'tags',
                      form.tags.filter((value) => value !== tag),
                    )
                  }
                  aria-label={`移除标签 ${tag}`}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
            <input
              id="tags"
              value={tagText}
              onChange={(event) => setTagText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addTags(tagText);
                }
              }}
              placeholder="输入标签，回车添加"
              maxLength={600}
            />
          </div>
          <small>多个标签可用逗号分开</small>
        </div>
        <div className="editor__ai">
          <button
            type="button"
            className="text-button"
            onClick={organize}
            disabled={!aiEnabled || Boolean(busy) || !(form.title || form.content)}
            title={aiEnabled ? '根据标题、摘要与速记内容生成建议' : '在服务端配置 AI 服务后启用'}
          >
            <Sparkles size={16} />
            {busy === 'ai' ? '正在整理…' : 'AI 整理'}
          </button>
          {!aiEnabled && <small>配置 AI 服务后可用</small>}
        </div>
        {suggestion && (
          <div className="ai-suggestion">
            <strong>{suggestion.title}</strong>
            <p>{suggestion.description}</p>
            <div className="item-card__tags">
              {suggestion.tags.map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </div>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                setForm((current) => ({
                  ...current,
                  title: suggestion.title,
                  description: suggestion.description,
                  tags: [...new Set([...current.tags, ...suggestion.tags])].slice(0, 20),
                }));
                setSuggestion(undefined);
              }}
            >
              采用建议
            </button>
            <button type="button" className="text-button" onClick={() => setSuggestion(undefined)}>
              忽略
            </button>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="editor__actions">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.status === 'done'}
              onChange={(event) => update('status', event.target.checked ? 'done' : 'unread')}
            />
            已经看过
          </label>
          <div>
            <button type="button" className="button button--secondary" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="button button--primary" disabled={Boolean(busy)}>
              {busy === 'save' ? '正在保存…' : item ? '保存修改' : '收藏'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
