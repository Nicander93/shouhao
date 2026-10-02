import { Bookmark, LockKeyhole } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <main className="login">
      <div className="login__brand">
        <Bookmark size={26} />
        <h1>收好</h1>
      </div>
      <p>打开你的收藏</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          try {
            await api.login(password);
            onSuccess();
          } catch (error) {
            setError(error instanceof Error ? error.message : '登录失败');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="password">
          <LockKeyhole size={16} />
          访问密码
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoFocus
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button button--primary" disabled={busy}>
          {busy ? '正在打开…' : '打开收好'}
        </button>
      </form>
    </main>
  );
}
