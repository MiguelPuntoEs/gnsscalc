import { useRef } from 'react';
import type { NtripVersion } from '../../util/ntrip';
import { SpinnerIcon } from './Icons';

export interface ConnectionFormProps {
  onConnect: (host: string, port: number, version: NtripVersion, username: string, password: string) => void;
  loading: boolean;
}

export const NTRIP_STORAGE_KEY = 'gnsscalc:ntrip-connection';

export function loadSavedConnection(): { host: string; port: string; version: NtripVersion; username: string; password: string; remember: boolean } {
  try {
    const raw = localStorage.getItem(NTRIP_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return {
        host: data.host ?? '',
        port: data.port ?? '2101',
        version: data.version === '1.0' ? '1.0' : '2.0',
        username: data.username ?? '',
        password: data.remember ? (data.password ?? '') : '',
        remember: data.remember ?? false,
      };
    }
  } catch { /* ignore */ }
  return { host: '', port: '2101', version: '2.0', username: '', password: '', remember: false };
}

export default function ConnectionForm({ onConnect, loading }: ConnectionFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const h = (fd.get('host') as string ?? '').trim().replace(/^https?:\/\//, '');
    if (!h) return;
    const port = (fd.get('port') as string) || '2101';
    const portNum = parseInt(port) || 2101;
    if (portNum < 1 || portNum > 65535) return;
    const version = (fd.get('version') as string) === '1.0' ? '1.0' as const : '2.0' as const;
    const username = (fd.get('username') as string ?? '').trim();
    const password = fd.get('password') as string ?? '';
    const remember = fd.get('remember') === 'on';
    try {
      const toSave: Record<string, unknown> = { host: h, port, version, username, remember };
      if (remember) toSave.password = password;
      localStorage.setItem(NTRIP_STORAGE_KEY, JSON.stringify(toSave));
    } catch { /* ignore */ }
    onConnect(h, portNum, version, username, password);
  };

  const saved = loadSavedConnection();

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="card">
      <div className="card-fields">
        <label>Host</label>
        <input
          type="text"
          name="host"
          defaultValue={saved.host}
          placeholder="caster.example.com"
          className="!text-left"
          required
        />
        <label>Port</label>
        <input
          type="text"
          name="port"
          inputMode="numeric"
          defaultValue={saved.port}
          placeholder="2101"
        />
        <label>Version</label>
        <div className="flex gap-2 items-center">
          <label className="flex items-center gap-1 !text-xs !font-normal !text-fg/70 !normal-case !tracking-normal cursor-pointer">
            <input type="radio" name="version" value="2.0" defaultChecked={saved.version === '2.0'} className="!w-auto !h-auto !min-w-0 accent-accent" />
            NTRIP 2.0
          </label>
          <label className="flex items-center gap-1 !text-xs !font-normal !text-fg/70 !normal-case !tracking-normal cursor-pointer">
            <input type="radio" name="version" value="1.0" defaultChecked={saved.version === '1.0'} className="!w-auto !h-auto !min-w-0 accent-accent" />
            NTRIP 1.0
          </label>
        </div>

        <div className="section-divider" />
        <div className="section-label">Authentication (optional)</div>
        <p className="col-span-full text-[10px] text-fg/30 -mt-1 mb-1 leading-snug">
          Credentials are sent directly from your browser to the caster.
          Nothing is transmitted to or stored on our servers.
        </p>

        <label>Username</label>
        <input
          type="text"
          name="username"
          defaultValue={saved.username}
          placeholder="optional"
          className="!text-left"
          autoComplete="username"
        />
        <label>Password</label>
        <input
          type="password"
          name="password"
          defaultValue={saved.password}
          placeholder="optional"
          className="!text-left"
          autoComplete="current-password"
        />
        <label />
        <label className="flex items-center gap-1.5 !text-xs !font-normal !text-fg/50 !normal-case !tracking-normal cursor-pointer">
          <input type="checkbox" name="remember" defaultChecked={saved.remember} className="!w-auto !h-auto !min-w-0 accent-accent" />
          Remember credentials
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <button type="submit" className="btn" disabled={loading}>
          {loading ? (
            <span className="flex items-center gap-1.5">
              <SpinnerIcon className="size-3.5 animate-spin" />
              Connecting…
            </span>
          ) : (
            'Get Sourcetable'
          )}
        </button>
      </div>
    </form>
  );
}
