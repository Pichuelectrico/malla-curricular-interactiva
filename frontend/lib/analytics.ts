export type AnalyticsViewName = 'curriculum' | 'teacher' | 'unknown';

const VISITOR_KEY = 'mci_visitor_id';
const DEBOUNCE_MS = 2000;

let lastTrack: { viewName: string; at: number } | null = null;

function randomUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getOrCreateVisitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const id = randomUuid();
    localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return randomUuid();
  }
}

export function parseUserAgent(ua: string): {
  device_type: 'mobile' | 'tablet' | 'desktop';
  browser: string;
  os: string;
} {
  const lower = ua.toLowerCase();

  const isTablet = /ipad|tablet|playbook|silk/i.test(ua);
  const isMobile = !isTablet && /mobile|iphone|ipod|android.*mobile|windows phone/i.test(ua);
  const device_type = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';

  let browser = 'Other';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) browser = 'Chrome';
  else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/firefox\//i.test(ua)) browser = 'Firefox';
  else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = 'Opera';

  let os = 'Other';
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/mac os x|macintosh/i.test(ua)) os = 'macOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  if (lower.includes('bot') || lower.includes('crawler')) {
    browser = 'Bot';
  }

  return { device_type, browser, os };
}

export function trackPageView(viewName: AnalyticsViewName): void {
  const now = Date.now();
  if (lastTrack && lastTrack.viewName === viewName && now - lastTrack.at < DEBOUNCE_MS) {
    return;
  }
  lastTrack = { viewName, at: now };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  if (!supabaseUrl) return;

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (!ua.trim()) return;

  const { device_type, browser, os } = parseUserAgent(ua);
  const referrer =
    typeof document !== 'undefined' && document.referrer ? document.referrer : null;

  const payload = {
    path: typeof window !== 'undefined' ? window.location.pathname : '/',
    view_name: viewName,
    visitor_id: getOrCreateVisitorId(),
    referrer,
    device_type,
    browser,
    os,
  };

  const url = `${supabaseUrl}/functions/v1/analytics-track`;

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Silent — analytics must not affect UX
  });
}
