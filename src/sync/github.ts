import { parsePayload } from './payload';
import { SyncError, type RemoteSnapshot, type SyncConfig, type SyncPayload, type SyncProvider } from './types';

const API = 'https://api.github.com';
const DATA_DIR = 'torque';
const DATA_FILE = 'data.json';

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Talks to the GitHub contents API from the browser. The token is only ever placed in the
 * Authorization header; it is never logged or put into an error message.
 */
export class GitHubProvider implements SyncProvider {
  constructor(
    private readonly config: SyncConfig,
    private readonly doFetch: Fetch = (input, init) => fetch(input, init),
  ) {}

  private url(path: string): string {
    const { owner, repo } = this.config;
    return `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`;
  }

  private async request(url: string, init: RequestInit & { accept?: string } = {}): Promise<Response> {
    const { accept = 'application/vnd.github+json', ...rest } = init;
    let res: Response;
    try {
      res = await this.doFetch(url, {
        ...rest,
        headers: { Authorization: `Bearer ${this.config.token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', ...(rest.headers ?? {}) },
      });
    } catch {
      throw new SyncError('network', 'Could not reach GitHub. Check your connection.');
    }
    return res;
  }

  private fail(res: Response): never {
    const s = res.status;
    if (s === 401) throw new SyncError('auth', 'The GitHub token was rejected (expired or revoked).', s);
    if (s === 403) throw new SyncError('auth', 'GitHub refused access. Check the token has Contents read and write on this repo.', s);
    if (s === 404) throw new SyncError('not_found', 'Repository not found, or the token cannot see it.', s);
    if (s === 409 || s === 422) throw new SyncError('conflict', 'The cloud file changed during sync.', s);
    throw new SyncError('other', `GitHub returned an error (${s}).`, s);
  }

  async test(): Promise<{ isPrivate: boolean }> {
    const res = await this.request(this.url(''));
    if (!res.ok) this.fail(res);
    const body = (await res.json()) as { private?: boolean };
    return { isPrivate: body.private === true };
  }

  async pull(): Promise<RemoteSnapshot> {
    // Read the sha first: if the file changes before the content read, our later write is rejected (409) and
    // retried, instead of silently overwriting the newer version.
    const listing = await this.request(this.url(`/contents/${DATA_DIR}`));
    if (listing.status === 404) return { sha: null, payload: null };
    if (!listing.ok) this.fail(listing);
    const entries = (await listing.json()) as { name: string; sha: string }[];
    const sha = entries.find((e) => e.name === DATA_FILE)?.sha ?? null;
    if (!sha) return { sha: null, payload: null };

    // The raw media type returns the file body directly, so files over 1 MB still load.
    const res = await this.request(this.url(`/contents/${DATA_DIR}/${DATA_FILE}`), { accept: 'application/vnd.github.raw+json' });
    if (res.status === 404) return { sha: null, payload: null };
    if (!res.ok) this.fail(res);
    let raw: unknown;
    try {
      raw = JSON.parse(await res.text());
    } catch {
      throw new SyncError('other', 'The cloud data is damaged or not Torque data.');
    }
    return { sha, payload: parsePayload(raw) };
  }

  async push(payload: SyncPayload, sha: string | null, message: string): Promise<void> {
    const res = await this.request(this.url(`/contents/${DATA_DIR}/${DATA_FILE}`), {
      method: 'PUT',
      body: JSON.stringify({ message, content: utf8ToBase64(JSON.stringify(payload)), ...(sha ? { sha } : {}) }),
    });
    if (!res.ok) this.fail(res);
  }

  async putAttachment(id: string, blob: Blob): Promise<void> {
    const res = await this.request(this.url(`/contents/${DATA_DIR}/attachments/${id}.jpg`), {
      method: 'PUT',
      body: JSON.stringify({ message: `Add receipt photo ${id}`, content: await blobToBase64(blob) }),
    });
    // 422 without a sha means the file already exists, which is what we wanted.
    if (!res.ok && res.status !== 422 && res.status !== 409) this.fail(res);
  }

  async getAttachment(id: string): Promise<Blob | null> {
    const res = await this.request(this.url(`/contents/${DATA_DIR}/attachments/${id}.jpg`), { accept: 'application/vnd.github.raw+json' });
    if (res.status === 404) return null;
    if (!res.ok) this.fail(res);
    return new Blob([await res.arrayBuffer()], { type: 'image/jpeg' });
  }
}
