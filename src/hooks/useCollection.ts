import { useCallback, useEffect, useState } from 'react';
import type { CollectionItem, ItemInput } from '../../shared/types';
import { api } from '../lib/api';
export function useCollection(enabled: boolean) {
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await api.list());
    } catch (error) {
      setError(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (enabled) void reload();
    else {
      setItems([]);
      setLoading(false);
    }
  }, [enabled, reload]);
  async function save(input: ItemInput, id?: string) {
    const item = await api.save(input, id);
    setItems((current) =>
      id ? current.map((value) => (value.id === id ? item : value)) : [item, ...current],
    );
    return item;
  }
  async function remove(id: string) {
    await api.remove(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }
  return { items, loading, error, reload, save, remove };
}
