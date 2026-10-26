type BadgeNavigator = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

export type BadgeResult = 'enabled' | 'denied' | 'unsupported';

export function badgeSupported(): boolean {
  return typeof (navigator as BadgeNavigator).setAppBadge === 'function';
}

/**
 * Turning the badge on needs notification permission on iOS (16.4+, installed app only).
 * Where there is no Notification API but badges work (desktop Chrome), no permission is needed.
 */
export async function enableBadge(): Promise<BadgeResult> {
  if (!badgeSupported()) return 'unsupported';
  if (typeof Notification === 'undefined') return 'enabled';
  if (Notification.permission === 'granted') return 'enabled';
  if (Notification.permission === 'denied') return 'denied';
  return (await Notification.requestPermission()) === 'granted' ? 'enabled' : 'denied';
}

/** Shows `count` on the app icon, or clears it when disabled, zero, or not permitted. Never throws. */
export async function applyBadge(enabled: boolean, count: number): Promise<void> {
  const nav = navigator as BadgeNavigator;
  if (!badgeSupported()) return;
  const allowed = enabled && count > 0 && (typeof Notification === 'undefined' || Notification.permission === 'granted');
  try {
    if (allowed) await nav.setAppBadge?.(count);
    else await nav.clearAppBadge?.();
  } catch {
    // Badging is a nicety; a failure must never affect the app.
  }
}
