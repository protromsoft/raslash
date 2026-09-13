import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react';
import {
  addAdminRating,
  approvePlace,
  backendLabel,
  createPlace,
  deleteAdminNotification,
  deletePlace,
  deleteRating,
  getAllPlaces,
  getAdminMessages,
  getAdminNotifications,
  getApprovedPlaces,
  getDashboardStats,
  getPendingPlaces,
  getRatings,
  getRecentRatings,
  getRejectedPlaces,
  rejectPlace,
  updatePlace,
  updatePlaceImage,
} from './lib/api';
import { isGoogleConfigured, syncGooglePlacesToSupabase } from './lib/googleSync';
import { adminSignIn, adminSignOut, getAdminAuthState } from './lib/auth';
import { isSupabaseConfigured } from './lib/supabase';
import type {
  AdminMessage,
  AdminNotification,
  DashboardStats,
  Place,
  PlaceStatus,
  Rating,
} from './lib/types';
import './App.css';

type Tab =
  | 'home'
  | 'pending'
  | 'places'
  | 'reviews'
  | 'messages'
  | 'notifications'
  | 'images'
  | 'sync';

const AUDIT_PAGE_SIZE = 50;

const TAB_META: Record<Tab, { title: string; eyebrow: string; description: string }> = {
  home: {
    title: 'Operasyon özeti',
    eyebrow: 'GENEL BAKIŞ',
    description: 'Mekân kuyruğunu, topluluk içeriğini ve veri akışını tek yerden izle.',
  },
  pending: {
    title: 'Bekleyen onaylar',
    eyebrow: 'MEKÂNLAR',
    description: 'Yeni mekânları yayına almadan önce ad, konum ve görselini kontrol et.',
  },
  places: {
    title: 'Mekân yönetimi',
    eyebrow: 'MEKÂNLAR',
    description: 'Kayıtları bul, düzenle ve yayın durumunu yönet.',
  },
  reviews: {
    title: 'Yorum moderasyonu',
    eyebrow: 'TOPLULUK GÜVENLİĞİ',
    description: 'Mekân yorumlarını gözden geçir ve gerekli müdahaleyi yap.',
  },
  messages: {
    title: 'Mesaj denetimi',
    eyebrow: 'TOPLULUK GÜVENLİĞİ',
    description: 'Mekân sohbetlerini yalnızca moderasyon amacıyla incele.',
  },
  notifications: {
    title: 'Bildirim yönetimi',
    eyebrow: 'TOPLULUK GÜVENLİĞİ',
    description: 'Kullanıcıların uygulama içi bildirim kayıtlarını incele ve yönet.',
  },
  images: {
    title: 'Görsel yönetimi',
    eyebrow: 'İÇERİK',
    description: 'Mekân görsellerini kontrol et ve gerektiğinde değiştir.',
  },
  sync: {
    title: 'Google Places sync',
    eyebrow: 'VERİ AKIŞI',
    description: 'Dış kaynaktan gelen mekânları kontrollü biçimde eşitle.',
  },
};

const NAV_GROUPS: Array<{ title: string; items: Array<{ tab: Tab; icon: string; label: string }> }> = [
  { title: 'Çalışma alanı', items: [{ tab: 'home', icon: '◫', label: 'Özet' }] },
  {
    title: 'Mekânlar',
    items: [
      { tab: 'pending', icon: '◷', label: 'Onay kuyruğu' },
      { tab: 'places', icon: '▦', label: 'Tüm mekânlar' },
      { tab: 'images', icon: '◇', label: 'Görseller' },
      { tab: 'sync', icon: '⇄', label: 'Google Sync' },
    ],
  },
  {
    title: 'Topluluk güvenliği',
    items: [
      { tab: 'reviews', icon: '✦', label: 'Yorumlar' },
      { tab: 'messages', icon: '▤', label: 'Mesajlar' },
      { tab: 'notifications', icon: '◎', label: 'Bildirimler' },
    ],
  },
];

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

const IMAGE_POOL = [
  'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&q=80',
  'https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=800&q=80',
  'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80',
  'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80',
  'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800&q=80',
  'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=800&q=80',
];

const AUTH_KEY = 'raslash.admin.authed';
const ADMIN_PASSWORD = import.meta.env.DEV
  ? (import.meta.env.VITE_ADMIN_PASSWORD as string | undefined) || 'raslash'
  : '';

function Login({
  onOk,
  mode,
}: {
  onOk: (email?: string) => void;
  mode: 'supabase' | 'password';
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'supabase') {
        const signedEmail = await adminSignIn(email, password);
        onOk(signedEmail);
      } else if (password === ADMIN_PASSWORD) {
        sessionStorage.setItem(AUTH_KEY, '1');
        onOk();
      } else {
        setError('Şifre yanlış');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş hatası');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="loginShell">
      <form className="loginCard" onSubmit={(e) => void submit(e)}>
        <div className="brand">raslash</div>
        <p>Admin paneli</p>
        {mode === 'supabase' ? (
          <input
            type="email"
            placeholder="E-posta"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
          />
        ) : null}
        <input
          type="password"
          placeholder={mode === 'supabase' ? 'Şifre' : 'Admin şifresi'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus={mode !== 'supabase'}
          required
        />
        {error ? <div className="error">{error}</div> : null}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Giriş…' : 'Giriş'}
        </button>
        <small>
          {mode === 'supabase'
            ? 'Supabase hesabı + profiles.is_admin = true gerekli'
            : 'Demo şifre: raslash'}
        </small>
      </form>
    </div>
  );
}

export default function App() {
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [authed, setAuthed] = useState(() =>
    isSupabaseConfigured ? false : sessionStorage.getItem(AUTH_KEY) === '1',
  );
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [pending, setPending] = useState<Place[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [rejected, setRejected] = useState<Place[]>([]);
  const [allPlaces, setAllPlaces] = useState<Place[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [recentRatings, setRecentRatings] = useState<Rating[]>([]);
  const [adminMessages, setAdminMessages] = useState<AdminMessage[]>([]);
  const [adminNotifications, setAdminNotifications] = useState<AdminNotification[]>([]);
  const [messageQuery, setMessageQuery] = useState('');
  const [messageSearch, setMessageSearch] = useState('');
  const [messageOffset, setMessageOffset] = useState(0);
  const [messageTotal, setMessageTotal] = useState(0);
  const [notificationQuery, setNotificationQuery] = useState('');
  const [notificationSearch, setNotificationSearch] = useState('');
  const [notificationOffset, setNotificationOffset] = useState(0);
  const [notificationTotal, setNotificationTotal] = useState(0);
  const [messageLoading, setMessageLoading] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [notificationError, setNotificationError] = useState('');
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const messageRequest = useRef(0);
  const notificationRequest = useRef(0);
  const [comment, setComment] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PlaceStatus>('all');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncPhase, setSyncPhase] = useState('');
  const [draft, setDraft] = useState({
    name: '',
    category: 'Cafe',
    city: 'Istanbul',
    latitude: '41.015',
    longitude: '28.979',
    image_url: '',
    status: 'approved' as PlaceStatus,
  });
  const [showCreate, setShowCreate] = useState(false);

  const selected =
    allPlaces.find((p) => p.id === selectedId) ||
    places.find((p) => p.id === selectedId) ||
    places[0] ||
    allPlaces[0];
  const totalPlaceCount = stats ? stats.approved + stats.pending + stats.rejected : 0;

  const reload = useCallback(async () => {
    setError('');
    setDashboardError('');
    setDashboardLoading(true);
    try {
      const [p, a, r, all, s, recent] = await Promise.all([
        getPendingPlaces(),
        getApprovedPlaces(),
        getRejectedPlaces(),
        getAllPlaces(),
        getDashboardStats(),
        getRecentRatings(60),
      ]);
      setPending(p);
      setPlaces(a);
      setRejected(r);
      setAllPlaces(all);
      setStats(s);
      setRecentRatings(recent);
      setSelectedId((prev) => prev || a[0]?.id || all[0]?.id || '');
      setLastRefreshed(new Date());
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Yükleme hatası';
      setError(message);
      setDashboardError(message);
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (offset: number, search: string) => {
    const request = ++messageRequest.current;
    setMessageLoading(true);
    setMessageError('');
    try {
      const page = await getAdminMessages({
        limit: AUDIT_PAGE_SIZE,
        offset,
        query: search,
      });
      if (request !== messageRequest.current) return;
      if (offset > 0 && page.items.length === 0) {
        setMessageOffset(Math.max(0, offset - AUDIT_PAGE_SIZE));
        return;
      }
      setAdminMessages(page.items);
      setMessageTotal(page.total);
    } catch (e) {
      if (request !== messageRequest.current) return;
      setAdminMessages([]);
      setMessageTotal(0);
      setMessageError(e instanceof Error ? e.message : 'Mesajlar yüklenemedi');
    } finally {
      if (request === messageRequest.current) setMessageLoading(false);
    }
  }, []);

  const loadNotifications = useCallback(async (offset: number, search: string) => {
    const request = ++notificationRequest.current;
    setNotificationLoading(true);
    setNotificationError('');
    try {
      const page = await getAdminNotifications({
        limit: AUDIT_PAGE_SIZE,
        offset,
        query: search,
      });
      if (request !== notificationRequest.current) return;
      if (offset > 0 && page.items.length === 0) {
        setNotificationOffset(Math.max(0, offset - AUDIT_PAGE_SIZE));
        return;
      }
      setAdminNotifications(page.items);
      setNotificationTotal(page.total);
    } catch (e) {
      if (request !== notificationRequest.current) return;
      setAdminNotifications([]);
      setNotificationTotal(0);
      setNotificationError(e instanceof Error ? e.message : 'Bildirimler yüklenemedi');
    } finally {
      if (request === notificationRequest.current) setNotificationLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthReady(true);
      return;
    }
    void getAdminAuthState()
      .then((state) => {
        setAdminEmail(state.email);
        setAuthed(state.isAdmin);
        setAuthReady(true);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Auth yüklenemedi');
        setAuthReady(true);
      });
  }, []);

  useEffect(() => {
    if (!authed) return;
    void reload();
  }, [authed, reload]);

  useEffect(() => {
    if (!authed || tab !== 'messages') return;
    void loadMessages(messageOffset, messageSearch);
  }, [authed, loadMessages, messageOffset, messageSearch, tab]);

  useEffect(() => {
    if (!authed || tab !== 'notifications') return;
    void loadNotifications(notificationOffset, notificationSearch);
  }, [authed, loadNotifications, notificationOffset, notificationSearch, tab]);

  useEffect(() => {
    if (!selected?.id || (tab !== 'reviews' && tab !== 'images' && tab !== 'places')) return;
    void getRatings(selected.id)
      .then(setRatings)
      .catch((e) => setError(e instanceof Error ? e.message : 'Yorum hatası'));
  }, [selected?.id, tab]);

  useEffect(() => {
    if (showCreate) {
      setDraft({
        name: '',
        category: 'Cafe',
        city: 'Istanbul',
        latitude: '',
        longitude: '',
        image_url: '',
        status: 'pending',
      });
      return;
    }
    if (!selected) return;
    setDraft({
      name: selected.name,
      category: selected.category || 'Cafe',
      city: selected.city || 'Istanbul',
      latitude: String(selected.latitude),
      longitude: String(selected.longitude),
      image_url: selected.image_url || '',
      status: selected.status,
    });
  }, [selected, showCreate]);

  const run = async (fn: () => Promise<void>, okMsg?: string) => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await fn();
      await reload();
      if (selected?.id) {
        try {
          setRatings(await getRatings(selected.id));
        } catch {
          /* ignore */
        }
      }
      if (okMsg) setInfo(okMsg);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İşlem hatası');
    } finally {
      setBusy(false);
    }
  };

  const filteredPlaces = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allPlaces.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.city || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
      );
    });
  }, [allPlaces, query, statusFilter]);

  if (!authReady) {
    return (
      <div className="loginShell">
        <div className="loginCard">
          <div className="brand">raslash</div>
          <p>Oturum kontrol ediliyor…</p>
        </div>
      </div>
    );
  }

  if (!isSupabaseConfigured && !import.meta.env.DEV) {
    return (
      <div className="loginShell">
        <div className="loginCard">
          <div className="brand">raslash</div>
          <h1>Yapılandırma eksik</h1>
          <p>Yönetim paneli Supabase bağlantısı olmadan üretimde açılamaz. Lütfen dağıtım ortamındaki proje URL’sini ve yayımlanabilir anahtarı yapılandırın.</p>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <Login
        mode={isSupabaseConfigured ? 'supabase' : 'password'}
        onOk={(email) => {
          setAdminEmail(email ?? null);
          setAuthed(true);
        }}
      />
    );
  }

  return (
    <div className="shell">
      <aside className="side">
        <div className="sideIdentity">
          <div className="brand">raslash<span className="brandPeriod">.</span></div>
          <div className="sideSub">Yönetim merkezi</div>
        </div>
        <nav aria-label="Yönetim bölümleri">
          {NAV_GROUPS.map((group) => (
            <div className="navGroup" key={group.title}>
              <div className="navGroupLabel">{group.title}</div>
              {group.items.map((item) => {
                const count =
                  item.tab === 'pending' ? pending.length :
                  item.tab === 'places' ? allPlaces.length :
                  item.tab === 'messages' ? messageTotal :
                  item.tab === 'notifications' ? notificationTotal : 0;
                return (
                  <button
                    key={item.tab}
                    type="button"
                    className={tab === item.tab ? 'nav active' : 'nav'}
                    aria-current={tab === item.tab ? 'page' : undefined}
                    onClick={() => setTab(item.tab)}
                  >
                    <span className="navIcon" aria-hidden="true">{item.icon}</span>
                    <span className="navText">{item.label}</span>
                    {count > 0 ? <span className="navCount">{count}</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="backend">
          <div className="backendStatus">
            <span className={!isSupabaseConfigured ? 'statusDot demo' : dashboardError ? 'statusDot problem' : lastRefreshed ? 'statusDot' : 'statusDot checking'} />
            <strong>{!isSupabaseConfigured ? 'Yalnızca demo' : dashboardError ? 'Bağlantı sorunu' : lastRefreshed ? 'Bağlantı doğrulandı' : 'Bağlantı kontrol ediliyor'}</strong>
          </div>
          <p className="backendDetail">Veri kaynağı: {backendLabel()}</p>
          {adminEmail ? <p className="backendEmail" title={adminEmail}>{adminEmail}</p> : null}
          {!isSupabaseConfigured ? (
            <p>
              Bu şifre yalnızca yerel demoyu açar; üretim hesabına yetki vermez.
            </p>
          ) : (
            <p>Hassas moderasyon verileri için sunucuda <code>profiles.is_admin</code> doğrulanır.</p>
          )}
          <button
            className="nav logout"
            onClick={() => {
              void (async () => {
                messageRequest.current += 1;
                notificationRequest.current += 1;
                setAdminMessages([]);
                setAdminNotifications([]);
                setMessageTotal(0);
                setNotificationTotal(0);
                setMessageLoading(false);
                setNotificationLoading(false);
                setMessageError('');
                setNotificationError('');
                sessionStorage.removeItem(AUTH_KEY);
                await adminSignOut();
                setAdminEmail(null);
                setAuthed(false);
              })();
            }}
          >
            Çıkış
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="top">
          <div>
            <span className="sectionEyebrow">{TAB_META[tab].eyebrow}</span>
            <h1>{TAB_META[tab].title}</h1>
            <p className="sectionDescription">{TAB_META[tab].description}</p>
          </div>
          <div className="topActions">
            {tab === 'places' ? (
              <button className="ghost" onClick={() => setShowCreate((v) => !v)} disabled={busy}>
                {showCreate ? 'Formu kapat' : 'Yeni mekan'}
              </button>
            ) : null}
            <button
              className="ghost"
              onClick={() => {
                if (tab === 'messages') {
                  void loadMessages(messageOffset, messageSearch);
                } else if (tab === 'notifications') {
                  void loadNotifications(notificationOffset, notificationSearch);
                } else {
                  void reload();
                }
              }}
              disabled={busy || messageLoading || notificationLoading || dashboardLoading}
            >
              Yenile
            </button>
          </div>
        </header>

        {error ? <div className="error" role="alert">{error}</div> : null}
        {info ? <div className="info" role="status">{info}</div> : null}

        {tab === 'home' && !stats && dashboardLoading ? (
          <div className="empty" role="status">Operasyon verileri yükleniyor…</div>
        ) : null}
        {tab === 'home' && !stats && !dashboardLoading && !error ? (
          <div className="empty">Özet verisi henüz yok. Yenile ile tekrar deneyebilirsin.</div>
        ) : null}
        {tab === 'home' && stats && (
          <section className="stack wide homeStack">
            <div className="homeHero">
              <div>
                <span className="heroEyebrow">RASLASH / OPERASYON</span>
                <h2>Topluluğu güvenle yönet.</h2>
                <p>Önce onay kuyruğunu temizle, ardından içerik ve bildirim kayıtlarını gözden geçir.</p>
                <div className="heroActions">
                  <button className="heroButton" onClick={() => setTab('pending')}>
                    Onay kuyruğuna git <span aria-hidden="true">↗</span>
                  </button>
                  <span className="heroQueue">{pending.length} bekleyen mekân</span>
                </div>
              </div>
              <div className="heroMark" aria-hidden="true">R<span>✳</span></div>
            </div>
            <div className="overviewMeta">
              <span>{isSupabaseConfigured ? 'Canlı operasyon görünümü' : 'Yerel demo görünümü'}</span>
              {lastRefreshed ? <time dateTime={lastRefreshed.toISOString()}>
                Son yenileme {new Intl.DateTimeFormat('tr-TR', { timeStyle: 'short' }).format(lastRefreshed)}
              </time> : null}
            </div>
            <div className="stats">
              <article className="stat approvedStat">
                <span>Onaylı</span>
                <strong>{stats.approved}</strong>
                <small>{totalPlaceCount} mekândan {totalPlaceCount > 0 ? `%${Math.round(stats.approved * 100 / totalPlaceCount)}` : '%0'}</small>
              </article>
              <article className="stat pendingStat">
                <span>Bekleyen</span>
                <strong>{stats.pending}</strong>
                <small>{totalPlaceCount} mekândan inceleme bekleyen</small>
              </article>
              <article className="stat">
                <span>Reddedilen</span>
                <strong>{stats.rejected}</strong>
                <small>{totalPlaceCount} mekândan yayında değil</small>
              </article>
              <article className="stat">
                <span>Yorum</span>
                <strong>{stats.ratings}</strong>
                <small>Toplam yorum kaydı</small>
              </article>
            </div>
            <div className="homeColumns">
              <div className="card priorityCard">
                <div className="cardHeading">
                  <span className="cardKicker">BUGÜNÜN İŞLERİ</span>
                  <h3>Öncelikli kontroller</h3>
                </div>
                <button className="priorityLink" onClick={() => setTab('pending')}>
                  <span className="priorityGlyph" aria-hidden="true">◷</span>
                  <span><strong>Onay kuyruğu</strong><small>{pending.length} kayıt inceleme bekliyor</small></span>
                  <span aria-hidden="true">↗</span>
                </button>
                <button className="priorityLink" onClick={() => setTab('messages')}>
                  <span className="priorityGlyph" aria-hidden="true">▤</span>
                  <span><strong>Mesaj denetimi</strong><small>Topluluk sohbetlerini incele</small></span>
                  <span aria-hidden="true">↗</span>
                </button>
                <button className="priorityLink" onClick={() => setTab('notifications')}>
                  <span className="priorityGlyph" aria-hidden="true">◎</span>
                  <span><strong>Bildirim yönetimi</strong><small>Kayıtları ara ve gerektiğinde sil</small></span>
                  <span aria-hidden="true">↗</span>
                </button>
              </div>
              <div className="card guardrailCard">
                <span className="cardKicker">GÜVENLİ YÖNETİM</span>
                <h3>Yayın öncesi kontrol</h3>
                <p>Yeni mekânın konumu ve görseli doğru mu? Bildirim silme yalnızca uygulama içi kaydı kaldırır; telefona teslim edilmiş sistem bildirimi geri çekmez.</p>
                <button className="ghost" onClick={() => setTab('places')}>Mekânları incele ↗</button>
              </div>
            </div>
            <div className="card">
              <h3>Son yorumlar</h3>
              {recentRatings.length === 0 ? (
                <p className="muted">Henüz yorum yok.</p>
              ) : (
                <div className="list">
                  {recentRatings.slice(0, 8).map((r) => (
                    <div key={r.id} className="listRow">
                      <div>
                        <strong>{r.place_name || 'Mekan'}</strong>
                        <p>
                          {r.author_name}: {r.review || 'puan'}
                        </p>
                      </div>
                      <small>
                        {r.wifi}/{r.comfort}/{r.outlets}
                      </small>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {tab === 'pending' && (
          <section className="grid">
            {pending.length === 0 ? (
              <div className="empty">Bekleyen mekan yok.</div>
            ) : (
              pending.map((p) => (
                <article key={p.id} className="card">
                  {p.image_url ? <img src={p.image_url} alt="" className="thumb" /> : null}
                  <h3>{p.name}</h3>
                  <p>
                    {p.city} · {p.category} · {p.submitted_by_name || 'user'}
                  </p>
                  <p className="pendingCoordinates">{p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}</p>
                  <div className="actions">
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => void run(() => approvePlace(p.id), 'Onaylandı')}
                    >
                      Onayla
                    </button>
                    <button
                      className="ghost"
                      disabled={busy}
                      onClick={() => {
                        if (!confirm(`“${p.name}” adlı mekân reddedilsin mi?`)) return;
                        void run(() => rejectPlace(p.id), 'Reddedildi');
                      }}
                    >
                      Reddet
                    </button>
                  </div>
                </article>
              ))
            )}
          </section>
        )}

        {tab === 'places' && (
          <section className="placesLayout">
            <div className="placesListPane">
              <div className="toolbar">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ara: isim, şehir, kategori…"
                />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | PlaceStatus)}
                >
                  <option value="all">Tümü</option>
                  <option value="approved">Onaylı</option>
                  <option value="pending">Bekleyen</option>
                  <option value="rejected">Red</option>
                </select>
              </div>
              <div className="placeList">
                {filteredPlaces.map((p) => (
                  <button
                    key={p.id}
                    className={selected?.id === p.id ? 'placeItem active' : 'placeItem'}
                    onClick={() => setSelectedId(p.id)}
                  >
                    {p.image_url ? <img src={p.image_url} alt="" /> : <div className="ph" />}
                    <div>
                      <strong>{p.name}</strong>
                      <span>
                        {p.status} · {p.category} · {p.source}
                      </span>
                    </div>
                  </button>
                ))}
                {filteredPlaces.length === 0 ? <div className="empty">Sonuç yok.</div> : null}
              </div>
            </div>

            <div className="placesDetailPane stack">
              {showCreate ? (
                <form
                  className="card"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      const created = await createPlace({
                        name: draft.name,
                        category: draft.category,
                        city: draft.city,
                        latitude: Number(draft.latitude),
                        longitude: Number(draft.longitude),
                        image_url: draft.image_url || null,
                        source: 'user',
                        status: draft.status,
                        submitted_by_name: 'Admin',
                      });
                      setSelectedId(created.id);
                      setShowCreate(false);
                    }, 'Mekan eklendi');
                  }}
                >
                  <h3>Yeni mekan</h3>
                  <PlaceFields draft={draft} setDraft={setDraft} />
                  <button className="primary" type="submit" disabled={busy || !draft.name.trim()}>
                    Kaydet
                  </button>
                </form>
              ) : null}

              {selected && !showCreate ? (
                <form
                  className="card"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(
                      () =>
                        updatePlace(selected.id, {
                          name: draft.name.trim(),
                          category: draft.category.trim(),
                          city: draft.city.trim(),
                          latitude: Number(draft.latitude),
                          longitude: Number(draft.longitude),
                          image_url: draft.image_url || null,
                          status: draft.status,
                        }),
                      'Kaydedildi',
                    );
                  }}
                >
                  <div className="detailHead">
                    <h3>Düzenle</h3>
                    <span className={`badge ${selected.status}`}>{selected.status}</span>
                  </div>
                  {selected.image_url ? (
                    <img src={selected.image_url} alt="" className="hero small" />
                  ) : null}
                  <PlaceFields draft={draft} setDraft={setDraft} />
                  <div className="actions">
                    <button className="primary" type="submit" disabled={busy}>
                      Kaydet
                    </button>
                    {selected.status !== 'approved' ? (
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy}
                        onClick={() =>
                          void run(() => approvePlace(selected.id), 'Onaylandı')
                        }
                      >
                        Onayla
                      </button>
                    ) : null}
                    {selected.status !== 'rejected' ? (
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy}
                        onClick={() =>
                          void run(() => rejectPlace(selected.id), 'Reddedildi')
                        }
                      >
                        Reddet
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="danger"
                      disabled={busy}
                      onClick={() => {
                        if (!confirm(`"${selected.name}" silinsin mi?`)) return;
                        void run(async () => {
                          await deletePlace(selected.id);
                          setSelectedId('');
                        }, 'Silindi');
                      }}
                    >
                      Sil
                    </button>
                  </div>
                  <p className="muted tiny">
                    Kaynak: {selected.source}
                    {selected.google_place_id ? ` · Google ID: ${selected.google_place_id}` : ''}
                  </p>
                </form>
              ) : null}
            </div>
          </section>
        )}

        {tab === 'reviews' && (
          <section className="stack wide">
            <label>
              Mekan filtresi
              <select
                value={selected?.id || ''}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            {(selected ? ratings : recentRatings).map((r) => (
              <article key={r.id} className="card row">
                <div>
                  <strong>
                    {r.place_name ? `${r.place_name} · ` : ''}
                    {r.author_name || 'User'}
                  </strong>
                  <p>{r.review || '(sadece puan)'}</p>
                  <small>
                    Wi‑Fi {r.wifi} · Rahatlık {r.comfort} · Priz {r.outlets}
                  </small>
                </div>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm(`Bu yorum kalıcı olarak silinsin mi?`)) return;
                    void run(() => deleteRating(r.id), 'Yorum silindi');
                  }}
                >
                  Sil
                </button>
              </article>
            ))}

            {selected ? (
              <div className="card">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Admin yorumu ekle…"
                  rows={3}
                />
                <button
                  className="primary"
                  disabled={busy || !comment.trim()}
                  onClick={() =>
                    void run(async () => {
                      await addAdminRating(selected.id, comment.trim());
                      setComment('');
                    }, 'Yorum eklendi')
                  }
                >
                  Yorum ekle
                </button>
              </div>
            ) : null}
          </section>
        )}

        {tab === 'messages' && (
          <section className="stack wide auditSection">
            <div className="card auditIntro">
              <span className="cardKicker">MODERASYON GÖRÜNÜMÜ</span>
              <h3>Tüm mekan mesajları</h3>
              <p className="muted">
                İçerikler yalnızca topluluk güvenliği ve moderasyon amacıyla gösterilir. E-posta,
                tam konum veya başka hesap bilgileri bu ekrana getirilmez.
              </p>
              <p className="auditScope">Görüntüleme yetkisi istemcideki giriş ekranına değil, sunucudaki admin kontrolüne bağlıdır.</p>
            </div>
            <form
              className="auditToolbar"
              onSubmit={(event) => {
                event.preventDefault();
                const next = messageQuery.trim();
                if (messageOffset === 0 && messageSearch === next) {
                  void loadMessages(0, next);
                  return;
                }
                setMessageOffset(0);
                setMessageSearch(next);
              }}
            >
              <input
                aria-label="Mesajlarda ara"
                value={messageQuery}
                onChange={(event) => setMessageQuery(event.target.value)}
                placeholder="Mesaj, kullanıcı veya mekan ara…"
              />
              <button className="primary" type="submit" disabled={messageLoading}>
                Ara
              </button>
              {messageSearch ? (
                <button className="ghost" type="button" disabled={messageLoading} onClick={() => {
                  setMessageQuery('');
                  setMessageOffset(0);
                  setMessageSearch('');
                }}>Temizle</button>
              ) : null}
            </form>
            <div className="auditSummary">
              <strong>{messageTotal}</strong> mesaj
              {messageSearch ? <span> · “{messageSearch}” filtresi</span> : null}
            </div>
            {messageError ? <div className="error" role="alert">{messageError} <button className="inlineRetry" onClick={() => void loadMessages(messageOffset, messageSearch)}>Tekrar dene</button></div> : null}
            {messageLoading ? <div className="empty" role="status">Mesajlar yükleniyor…</div> : null}
            {!messageLoading && !messageError && adminMessages.length === 0 ? (
              <div className="empty">{messageSearch ? 'Bu aramaya uygun mesaj bulunamadı.' : 'Henüz mesaj yok.'}</div>
            ) : null}
            {!messageLoading && !messageError ? (
              <div className="auditList">
                {adminMessages.map((message) => (
                  <article className="card auditCard" key={message.id}>
                    <div className="auditCardHead">
                      <div>
                        <strong>{message.userName}</strong>
                        <span>{message.placeName}</span>
                      </div>
                      <time dateTime={message.createdAt}>{formatDate(message.createdAt)}</time>
                    </div>
                    <p className="auditBody">{message.body}</p>
                    <div className="auditIds">
                      <code>Kullanıcı: {message.userId}</code>
                      <code>Mesaj: {message.id}</code>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
            <div className="pager">
              <button
                className="ghost"
                disabled={messageLoading || messageOffset === 0}
                onClick={() => setMessageOffset((value) => Math.max(0, value - AUDIT_PAGE_SIZE))}
              >
                Önceki
              </button>
              <span>
                {messageTotal === 0 ? 0 : messageOffset + 1}–
                {Math.min(messageOffset + AUDIT_PAGE_SIZE, messageTotal)} / {messageTotal}
              </span>
              <button
                className="ghost"
                disabled={
                  messageLoading || messageOffset + AUDIT_PAGE_SIZE >= messageTotal
                }
                onClick={() => setMessageOffset((value) => value + AUDIT_PAGE_SIZE)}
              >
                Sonraki
              </button>
            </div>
          </section>
        )}

        {tab === 'notifications' && (
          <section className="stack wide auditSection">
            <div className="card auditIntro">
              <span className="cardKicker">BİLDİRİM KAYITLARI</span>
              <h3>Uygulama içi bildirim kayıtları</h3>
              <p className="muted">
                Silme işlemi bildirimi ilgili kullanıcının uygulama içi kutusundan kalıcı olarak
                kaldırır; daha önce teslim edilmiş telefon bildirimi geri alınamaz.
              </p>
              <p className="auditScope">Bu ekrandaki silme yetkisi sunucuda <code>profiles.is_admin</code> ile doğrulanır.</p>
            </div>
            <form
              className="auditToolbar"
              onSubmit={(event) => {
                event.preventDefault();
                const next = notificationQuery.trim();
                if (notificationOffset === 0 && notificationSearch === next) {
                  void loadNotifications(0, next);
                  return;
                }
                setNotificationOffset(0);
                setNotificationSearch(next);
              }}
            >
              <input
                aria-label="Bildirimlerde ara"
                value={notificationQuery}
                onChange={(event) => setNotificationQuery(event.target.value)}
                placeholder="Başlık, içerik veya kullanıcı ara…"
              />
              <button className="primary" type="submit" disabled={notificationLoading}>
                Ara
              </button>
              {notificationSearch ? (
                <button className="ghost" type="button" disabled={notificationLoading} onClick={() => {
                  setNotificationQuery('');
                  setNotificationOffset(0);
                  setNotificationSearch('');
                }}>Temizle</button>
              ) : null}
            </form>
            <div className="auditSummary">
              <strong>{notificationTotal}</strong> bildirim
              {notificationSearch ? <span> · “{notificationSearch}” filtresi</span> : null}
            </div>
            {notificationError ? <div className="error" role="alert">{notificationError} <button className="inlineRetry" onClick={() => void loadNotifications(notificationOffset, notificationSearch)}>Tekrar dene</button></div> : null}
            {notificationLoading ? <div className="empty" role="status">Bildirimler yükleniyor…</div> : null}
            {!notificationLoading && !notificationError && adminNotifications.length === 0 ? (
              <div className="empty">{notificationSearch ? 'Bu aramaya uygun bildirim bulunamadı.' : 'Şu anda bildirim kaydı yok.'}</div>
            ) : null}
            {!notificationLoading && !notificationError ? (
              <div className="auditList">
                {adminNotifications.map((notification) => (
                  <article className="card auditCard" key={notification.id}>
                    <div className="auditCardHead">
                      <div>
                        <strong>{notification.title}</strong>
                        <span>
                          {notification.recipientName}
                          {notification.placeName ? ` · ${notification.placeName}` : ''}
                        </span>
                      </div>
                      <time dateTime={notification.createdAt}>
                        {formatDate(notification.createdAt)}
                      </time>
                    </div>
                    <p className="auditBody">{notification.body}</p>
                    <div className="auditFoot">
                      <div className="auditIds">
                        <span className="auditTag">{notification.type}</span>
                        <span className={`auditTag ${notification.read ? '' : 'unread'}`}>
                          {notification.read ? 'okundu' : 'okunmadı'}
                        </span>
                        {notification.recipientId ? (
                          <code>Kullanıcı: {notification.recipientId}</code>
                        ) : null}
                      </div>
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() => {
                          if (!confirm(`“${notification.title}” bildirimi ${notification.recipientName} adlı kullanıcının uygulama içi kutusundan kalıcı olarak silinsin mi?\n\nTelefona daha önce teslim edilmiş sistem bildirimi bu işlemle geri alınmaz.`)) return;
                          setBusy(true);
                          setError('');
                          setInfo('');
                          void deleteAdminNotification(notification.id)
                            .then(async () => {
                              setInfo('Bildirim kullanıcının kutusundan kaldırıldı.');
                              const nextOffset =
                                adminNotifications.length === 1 && notificationOffset > 0
                                  ? Math.max(0, notificationOffset - AUDIT_PAGE_SIZE)
                                  : notificationOffset;
                              if (nextOffset !== notificationOffset) {
                                setNotificationOffset(nextOffset);
                              } else {
                                await loadNotifications(nextOffset, notificationSearch);
                              }
                            })
                            .catch((e) =>
                              setError(e instanceof Error ? e.message : 'Bildirim silinemedi'),
                            )
                            .finally(() => setBusy(false));
                        }}
                      >
                        Sil
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
            <div className="pager">
              <button
                className="ghost"
                disabled={notificationLoading || notificationOffset === 0}
                onClick={() =>
                  setNotificationOffset((value) => Math.max(0, value - AUDIT_PAGE_SIZE))
                }
              >
                Önceki
              </button>
              <span>
                {notificationTotal === 0 ? 0 : notificationOffset + 1}–
                {Math.min(notificationOffset + AUDIT_PAGE_SIZE, notificationTotal)} /{' '}
                {notificationTotal}
              </span>
              <button
                className="ghost"
                disabled={
                  notificationLoading || notificationOffset + AUDIT_PAGE_SIZE >= notificationTotal
                }
                onClick={() => setNotificationOffset((value) => value + AUDIT_PAGE_SIZE)}
              >
                Sonraki
              </button>
            </div>
          </section>
        )}

        {tab === 'images' && selected && (
          <section className="stack">
            <label>
              Mekan
              <select value={selected.id} onChange={(e) => setSelectedId(e.target.value)}>
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {selected.image_url ? <img src={selected.image_url} alt="" className="hero" /> : null}
            <div className="thumbs">
              {IMAGE_POOL.map((url) => (
                <button
                  key={url}
                  className="imgPick"
                  disabled={busy}
                  onClick={() =>
                    void run(() => updatePlaceImage(selected.id, url), 'Görsel güncellendi')
                  }
                >
                  <img src={url} alt="" />
                </button>
              ))}
            </div>
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const url = String(fd.get('url') || '').trim();
                if (url) void run(() => updatePlaceImage(selected.id, url), 'URL kaydedildi');
              }}
            >
              <input
                name="url"
                placeholder="https://görsel-url"
                defaultValue={selected.image_url ?? ''}
                key={selected.id + (selected.image_url || '')}
              />
              <button className="primary" type="submit" disabled={busy}>
                URL kaydet
              </button>
            </form>
          </section>
        )}

        {tab === 'sync' && (
          <section className="stack">
            <div className="card">
              <h3>İstanbul Google Places → Supabase</h3>
              <p className="muted">
                Çalışma kafeleri / Starbucks / cowork filtreli. Google puanları gelmez — sadece
                isim ve konum.
              </p>
              <p className="muted">
                Google key: {isGoogleConfigured() ? 'tanımlı' : 'eksik (VITE_GOOGLE_PLACES_API_KEY)'}
              </p>
              {syncPhase ? <p>{syncPhase}</p> : null}
              <div className="actions">
                <button
                  className="primary"
                  disabled={busy || !isGoogleConfigured()}
                  onClick={() => {
                    if (!confirm('Google Places eşitlemesi canlı mekân kayıtlarını ekleyebilir veya güncelleyebilir. Devam edilsin mi?')) return;
                    void run(async () => {
                      const result = await syncGooglePlacesToSupabase((p) => {
                        setSyncPhase(
                          `${p.phase} · tutulan ${p.kept} · elenen ${p.filteredOut}`,
                        );
                      });
                      setSyncPhase(
                        `Bitti: ${result.upserted} upsert · ${result.kept} tutulan · ${result.filteredOut} elenen`,
                      );
                    }, 'Sync tamam');
                  }}
                >
                  Sync başlat
                </button>
              </div>
              <p className="muted tiny">
                Alternatif terminal: <code>npm run sync:supabase</code>
              </p>
            </div>
            <div className="card">
              <h3>Durum</h3>
              <p>
                Onaylı {places.length} · Bekleyen {pending.length} · Red {rejected.length}
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function PlaceFields({
  draft,
  setDraft,
}: {
  draft: {
    name: string;
    category: string;
    city: string;
    latitude: string;
    longitude: string;
    image_url: string;
    status: PlaceStatus;
  };
  setDraft: Dispatch<
    SetStateAction<{
      name: string;
      category: string;
      city: string;
      latitude: string;
      longitude: string;
      image_url: string;
      status: PlaceStatus;
    }>
  >;
}) {
  return (
    <div className="fields">
      <label>
        İsim
        <input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          required
        />
      </label>
      <div className="fieldRow">
        <label>
          Kategori
          <input
            value={draft.category}
            onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
          />
        </label>
        <label>
          Şehir
          <input
            value={draft.city}
            onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
          />
        </label>
      </div>
      <div className="fieldRow">
        <label>
          Enlem
          <input
            type="number"
            min="-90"
            max="90"
            step="any"
            value={draft.latitude}
            onChange={(e) => setDraft((d) => ({ ...d, latitude: e.target.value }))}
            required
          />
        </label>
        <label>
          Boylam
          <input
            type="number"
            min="-180"
            max="180"
            step="any"
            value={draft.longitude}
            onChange={(e) => setDraft((d) => ({ ...d, longitude: e.target.value }))}
            required
          />
        </label>
      </div>
      <label>
        Görsel URL
        <input
          value={draft.image_url}
          onChange={(e) => setDraft((d) => ({ ...d, image_url: e.target.value }))}
        />
      </label>
      <label>
        Durum
        <select
          value={draft.status}
          onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as PlaceStatus }))}
        >
          <option value="approved">approved</option>
          <option value="pending">pending</option>
          <option value="rejected">rejected</option>
        </select>
      </label>
    </div>
  );
}
