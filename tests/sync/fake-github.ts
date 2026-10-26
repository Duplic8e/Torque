/** An in-memory stand-in for the GitHub contents API, enough to exercise the provider and manager. */
export interface Commit {
  path: string;
  message: string;
}

export class FakeGitHub {
  readonly token = 'github_pat_FAKE_secret_token_123';
  isPrivate = true;
  online = true;
  /** When set, every request answers with this status (e.g. 401). */
  forceStatus: number | null = null;
  files = new Map<string, { bytes: Uint8Array; sha: string }>();
  commits: Commit[] = [];
  requests: { method: string; url: string; headers: Record<string, string> }[] = [];
  /** Runs just before a PUT is applied; used to simulate another device writing first. */
  beforePut: ((path: string) => void) | null = null;
  private counter = 0;

  readonly fetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
    if (!this.online) throw new TypeError('Failed to fetch');
    const method = init.method ?? 'GET';
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>));
    this.requests.push({ method, url: input, headers });
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

    if (this.forceStatus !== null) return json(this.forceStatus, { message: 'forced' });
    if (headers.Authorization !== `Bearer ${this.token}`) return json(401, { message: 'Bad credentials' });

    const url = new URL(input);
    const m = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)(\/contents\/(.*))?$/);
    if (!m || m[1] !== 'me' || m[2] !== 'torque-data') return json(404, { message: 'Not Found' });
    const path = m[4];

    if (path === undefined) return json(200, { private: this.isPrivate });

    if (method === 'GET') {
      const exact = this.files.get(path);
      if (exact) {
        if (headers.Accept?.includes('raw')) return new Response(exact.bytes as BodyInit, { status: 200 });
        return json(200, { sha: exact.sha });
      }
      const children = [...this.files.entries()].filter(([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'));
      if (children.length === 0) return json(404, { message: 'Not Found' });
      return json(200, children.map(([p, f]) => ({ name: p.split('/').pop(), path: p, sha: f.sha, type: 'file' })));
    }

    if (method === 'PUT') {
      this.beforePut?.(path);
      const body = JSON.parse(String(init.body)) as { message: string; content: string; sha?: string };
      const existing = this.files.get(path);
      if (existing && !body.sha) return json(422, { message: 'sha wasn\'t supplied' });
      if (existing && body.sha !== existing.sha) return json(409, { message: 'does not match' });
      this.write(path, Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0)), body.message);
      return json(200, { content: { sha: this.files.get(path)!.sha } });
    }
    return json(405, {});
  };

  /** Writes a file directly, as another device would. */
  write(path: string, bytes: Uint8Array, message = 'direct write'): void {
    this.files.set(path, { bytes, sha: `sha-${++this.counter}` });
    this.commits.push({ path, message });
  }

  text(path: string): string {
    return new TextDecoder().decode(this.files.get(path)?.bytes);
  }

  json<T = unknown>(path: string): T {
    return JSON.parse(this.text(path)) as T;
  }
}
