import {
  useCallback,
  useEffect,
  useMemo,
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
  deletePlace,
  deleteRating,
  getAllPlaces,
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
import type { DashboardStats, Place, PlaceStatus, Rating } from './lib/types';
import './App.css';

type Tab = 'home' | 'pending' | 'places' | 'reviews' | 'images' | 'sync';

const IMAGE_POOL = [
  'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&q=80',
  'https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=800&q=80',
  'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80',
  'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80',
  'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800&q=80',
  'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=800&q=80',
];

const AUTH_KEY = 'raslash.admin.authed';
const ADMIN_PASSWORD = (import.meta.env.VITE_ADMIN_PASSWORD as string | undefined) || 'raslash';

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

  const reload = useCallback(async () => {
    setError('');
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yükleme hatası');
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
    if (!selected?.id || (tab !== 'reviews' && tab !== 'images' && tab !== 'places')) return;
    void getRatings(selected.id)
      .then(setRatings)
      .catch((e) => setError(e instanceof Error ? e.message : 'Yorum hatası'));
  }, [selected?.id, tab]);

  useEffect(() => {
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
  }, [selected?.id]);

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
        <div className="brand">raslash</div>
        <div className="sideSub">Yönetim paneli</div>
        <nav>
          {(
            [
              ['home', 'Özet'],
              ['pending', `Onay (${pending.length})`],
              ['places', `Mekanlar (${allPlaces.length})`],
              ['reviews', 'Yorumlar'],
              ['images', 'Görseller'],
              ['sync', 'Google Sync'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? 'nav active' : 'nav'}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="backend">
          Backend: <strong>{backendLabel()}</strong>
          {adminEmail ? <p>{adminEmail}</p> : null}
          {!isSupabaseConfigured ? (
            <p>
              Supabase için <code>admin-web/.env</code> gerekli.
            </p>
          ) : (
            <p>Canlı Supabase bağlı.</p>
          )}
          <button
            className="nav logout"
            onClick={() => {
              void (async () => {
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
          <h1>
            {tab === 'home' && 'Özet'}
            {tab === 'pending' && 'Bekleyen onaylar'}
            {tab === 'places' && 'Mekan yönetimi'}
            {tab === 'reviews' && 'Yorum moderasyonu'}
            {tab === 'images' && 'Görsel yönetimi'}
            {tab === 'sync' && 'Google Places sync'}
          </h1>
          <div className="topActions">
            {tab === 'places' ? (
              <button className="ghost" onClick={() => setShowCreate((v) => !v)} disabled={busy}>
                {showCreate ? 'Formu kapat' : 'Yeni mekan'}
              </button>
            ) : null}
            <button className="ghost" onClick={() => void reload()} disabled={busy}>
              Yenile
            </button>
          </div>
        </header>

        {error ? <div className="error">{error}</div> : null}
        {info ? <div className="info">{info}</div> : null}

        {tab === 'home' && stats && (
          <section className="stack wide">
            <div className="stats">
              <article className="stat">
                <span>Onaylı</span>
                <strong>{stats.approved}</strong>
              </article>
              <article className="stat">
                <span>Bekleyen</span>
                <strong>{stats.pending}</strong>
              </article>
              <article className="stat">
                <span>Reddedilen</span>
                <strong>{stats.rejected}</strong>
              </article>
              <article className="stat">
                <span>Yorum</span>
                <strong>{stats.ratings}</strong>
              </article>
            </div>
            <div className="card">
              <h3>Hızlı işlemler</h3>
              <div className="actions">
                <button className="primary" onClick={() => setTab('pending')}>
                  Onay kuyruğu
                </button>
                <button className="ghost" onClick={() => setTab('places')}>
                  Mekan düzenle
                </button>
                <button className="ghost" onClick={() => setTab('sync')}>
                  Google sync
                </button>
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
                      onClick={() => void run(() => rejectPlace(p.id), 'Reddedildi')}
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
                  className="ghost"
                  disabled={busy}
                  onClick={() => void run(() => deleteRating(r.id), 'Yorum silindi')}
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
                  onClick={() =>
                    void run(async () => {
                      const result = await syncGooglePlacesToSupabase((p) => {
                        setSyncPhase(
                          `${p.phase} · tutulan ${p.kept} · elenen ${p.filteredOut}`,
                        );
                      });
                      setSyncPhase(
                        `Bitti: ${result.upserted} upsert · ${result.kept} tutulan · ${result.filteredOut} elenen`,
                      );
                    }, 'Sync tamam')
                  }
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
            value={draft.latitude}
            onChange={(e) => setDraft((d) => ({ ...d, latitude: e.target.value }))}
          />
        </label>
        <label>
          Boylam
          <input
            value={draft.longitude}
            onChange={(e) => setDraft((d) => ({ ...d, longitude: e.target.value }))}
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
