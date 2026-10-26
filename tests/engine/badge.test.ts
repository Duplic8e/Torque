import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyBadge, badgeSupported, enableBadge } from '../../src/core/badge';
import { attentionCount } from '../../src/engine/health';
import type { ItemDue } from '../../src/engine/due';

const item = (status: ItemDue['status']): ItemDue => ({ key: status, name: status, category: 'Other', kind: 'replace', status, progress: 0, drivenBy: 'time', lastDone: null, unknownBaseline: false });

describe('attentionCount', () => {
  it('counts overdue and due-soon items only', () => {
    expect(attentionCount([item('overdue'), item('soon'), item('soon'), item('ok'), item('inspect')])).toBe(3);
    expect(attentionCount([])).toBe(0);
  });
});

describe('badge', () => {
  const nav = navigator as Navigator & { setAppBadge?: unknown; clearAppBadge?: unknown };
  afterEach(() => {
    Reflect.deleteProperty(nav, 'setAppBadge');
    Reflect.deleteProperty(nav, 'clearAppBadge');
    vi.unstubAllGlobals();
  });
  const install = (permission: NotificationPermission, request: NotificationPermission = permission) => {
    const set = vi.fn().mockResolvedValue(undefined);
    const clear = vi.fn().mockResolvedValue(undefined);
    nav.setAppBadge = set;
    nav.clearAppBadge = clear;
    vi.stubGlobal('Notification', { permission, requestPermission: vi.fn().mockResolvedValue(request) });
    return { set, clear };
  };

  it('reports unsupported when the browser has no Badging API', async () => {
    expect(badgeSupported()).toBe(false);
    expect(await enableBadge()).toBe('unsupported');
    await expect(applyBadge(true, 3)).resolves.toBeUndefined();
  });

  it('asks for notification permission before enabling', async () => {
    install('default', 'granted');
    expect(await enableBadge()).toBe('enabled');
    install('default', 'denied');
    expect(await enableBadge()).toBe('denied');
    install('denied');
    expect(await enableBadge()).toBe('denied');
  });

  it('sets the count when enabled and permitted, otherwise clears', async () => {
    const a = install('granted');
    await applyBadge(true, 4);
    expect(a.set).toHaveBeenCalledWith(4);
    await applyBadge(true, 0);
    await applyBadge(false, 4);
    expect(a.clear).toHaveBeenCalledTimes(2);
    const b = install('default');
    await applyBadge(true, 4);
    expect(b.set).not.toHaveBeenCalled();
    expect(b.clear).toHaveBeenCalled();
  });

  it('swallows API failures', async () => {
    const a = install('granted');
    a.set.mockRejectedValue(new Error('nope'));
    await expect(applyBadge(true, 2)).resolves.toBeUndefined();
  });
});
