import { useEffect, useRef, useState } from 'react';
import type { AppConfig } from '../../shared/types';
import { api } from '../lib/api';

export function useAppSession(onExpired: () => void) {
  const [config, setConfig] = useState<AppConfig>();
  const [configError, setConfigError] = useState('');
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

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

    // api 收到 401 时派发 session-expired。这里取消登录态，并让页面关掉正在编辑的内容。
    const handleSessionExpired = () => {
      setConfig((current) => (current ? { ...current, authenticated: false } : current));
      onExpiredRef.current();
    };

    window.addEventListener('session-expired', handleSessionExpired);
    return () => window.removeEventListener('session-expired', handleSessionExpired);
  }, []);

  return { config, configError, loadConfig };
}
