const API_ROOT = "/api/v1";
const SESSION_KEY = "backlog_compass_session_v1";
const PAGE_SIZE = 24;

const state = {
  config: null,
  session: null,
  profile: null,
  page: "home",
  menuOpen: false,
  games: [],
  stats: null,
  total: 0,
  offset: 0,
  filters: { search: "", play_status: "", acquisition_status: "", platform: "", sort_by: "updated_at", order: "desc" },
  selectedGame: null,
  sessions: [],
  modal: null,
  recommendations: null,
  recommendationQuery: { mood: "", available_minutes: "60" },
  steamPreview: null,
  busy: false,
  lastError: "",
};

const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");

const icons = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  library: '<path d="M4 4v16M9 4v16M14 4v16M19 4v16"/><path d="M2 4h2m3 0h2m3 0h2m3 0h2"/>',
  discover: '<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle cx="12" cy="12" r="5"/><path d="m10 14 4-4"/>',
  settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.8Z" transform="translate(-1 -1) scale(1.08)"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  edit: '<path d="m4 16.5-.8 4.3 4.3-.8L20 7.5 16.5 4z"/><path d="m14.5 6 3.5 3.5"/>',
  trash: '<path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
  steam: '<path d="M8.3 13.2a3.2 3.2 0 1 0 2.9 4.6l3.4 1.5a3.1 3.1 0 1 0 1.3-2.8l-3.5-1.6a3.2 3.2 0 0 0-4.1-1.7Z"/><circle cx="16.6" cy="6.9" r="4.2"/><path d="m13.7 8.8 2.9-1.9"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20M8 7h8"/>',
};

function icon(name, size = 16) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.book}</svg>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function apiErrorMessage(payload, fallback = "Something went wrong.") {
  if (typeof payload?.detail === "string") return payload.detail;
  if (typeof payload?.msg === "string") return payload.msg;
  if (Array.isArray(payload?.detail)) return payload.detail.map((x) => x.msg || "Invalid input").join(" · ");
  if (typeof payload?.message === "string") return payload.message;
  return fallback;
}

function readSession() {
  try {
    const value = localStorage.getItem(SESSION_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  state.session = session;
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* Storage may be unavailable. */ }
}

function clearSession() {
  state.session = null;
  state.profile = null;
  try { localStorage.removeItem(SESSION_KEY); } catch { /* Ignore unavailable storage. */ }
}

async function loadConfig() {
  const response = await fetch(`${API_ROOT}/config`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Could not load public application configuration.");
  state.config = await response.json();
  if (!state.config.supabase_url || !state.config.supabase_publishable_key) {
    throw new Error("Supabase public configuration is incomplete. Check the server environment variables.");
  }
}

async function refreshAuthToken() {
  const session = state.session;
  if (!session?.refresh_token || !state.config) return false;
  const url = `${state.config.supabase_url.replace(/\/$/, "")}/auth/v1/token?grant_type=refresh_token`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: state.config.supabase_publishable_key },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    clearSession();
    return false;
  }
  saveSession({ ...payload, expires_at: payload.expires_at ? payload.expires_at * 1000 : Date.now() + (payload.expires_in || 3600) * 1000 });
  return true;
}

async function validAccessToken() {
  if (!state.session?.access_token) throw new Error("Please sign in to continue.");
  const expiresAt = Number(state.session.expires_at || 0);
  if (expiresAt && expiresAt < Date.now() + 60_000) {
    const refreshed = await refreshAuthToken();
    if (!refreshed) throw new Error("Your session expired. Please sign in again.");
  }
  return state.session.access_token;
}

async function api(path, options = {}, retry = true) {
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (options.auth !== false) headers.set("Authorization", `Bearer ${await validAccessToken()}`);
  const response = await fetch(`${API_ROOT}${path}`, { ...options, headers });
  if (response.status === 401 && options.auth !== false && retry) {
    const refreshed = await refreshAuthToken();
    if (refreshed) return api(path, options, false);
    clearSession();
    renderAuth();
    throw new Error("Your session expired. Please sign in again.");
  }
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(apiErrorMessage(payload, `Request failed (${response.status}).`));
  return payload;
}

async function supabaseAuth(path, body) {
  const url = `${state.config.supabase_url.replace(/\/$/, "")}/auth/v1/${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: state.config.supabase_publishable_key },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(apiErrorMessage(payload, "Authentication failed."));
  return payload;
}

function toast(message, type = "info") {
  const element = document.createElement("div");
  element.className = `toast ${type === "success" ? "toast--success" : type === "error" ? "toast--error" : ""}`;
  element.textContent = message;
  toastRegion.append(element);
  window.setTimeout(() => element.remove(), 3800);
}

function initials(name = "Player") {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "P";
}

function formatNumber(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatMinutes(minutes) {
  const value = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (hours <= 0) return `${formatNumber(rest)}m`;
  return rest ? `${formatNumber(hours)}h ${rest}m` : `${formatNumber(hours)}h`;
}

function safeHttpUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function statusLabel(status) {
  return ({ backlog: "Backlog", playing: "Playing", paused: "Paused", completed: "Completed", dropped: "Dropped" })[status] || "Backlog";
}

function appImage(appId, type = "cover") {
  if (!appId) return "";
  const safeId = encodeURIComponent(String(appId).replace(/[^0-9]/g, ""));
  if (!safeId) return "";
  return type === "header"
    ? `https://cdn.akamai.steamstatic.com/steam/apps/${safeId}/header.jpg`
    : `https://cdn.akamai.steamstatic.com/steam/apps/${safeId}/library_600x900_2x.jpg`;
}

function gameArt(game, className = "") {
  const appId = game.steam_app_id;
  const fallback = `<div class="game-card__art-fallback"><span>${escapeHtml(initials(game.name))}</span><small>BACKLOG COMPASS</small></div>`;
  return `<div class="game-card__art ${className}">${fallback}${appId ? `<img data-art src="${escapeHtml(appImage(appId))}" alt="${escapeHtml(game.name)} cover artwork" loading="lazy">` : ""}<div class="game-card__shade"></div></div>`;
}

function setPage(page) {
  state.page = page;
  state.offset = 0;
  state.menuOpen = false;
  state.modal = null;
  state.selectedGame = null;
  renderShell();
  if (page === "home") loadHome();
  if (page === "library") loadLibrary();
  if (page === "recommendations") loadRecommendations();
}

function shellHeader() {
  const name = state.profile?.display_name || "Player";
  return `
    <header class="topbar">
      <button class="icon-button mobile-menu" data-action="toggle-menu" aria-label="Toggle navigation">${icon("menu", 18)}</button>
      <div class="topbar-brand">
        <div class="brand-mark"><span class="brand-mark__glyph">B</span></div>
        <div class="brand-name"><strong>BACKLOG COMPASS</strong><span>YOUR GAME LIBRARY</span></div>
      </div>
      <nav class="topbar-nav" aria-label="Main navigation">
        <button class="topbar-link ${state.page === "home" ? "is-active" : ""}" data-action="nav" data-page="home">HOME</button>
        <button class="topbar-link ${state.page === "library" ? "is-active" : ""}" data-action="nav" data-page="library">LIBRARY</button>
        <button class="topbar-link ${state.page === "recommendations" ? "is-active" : ""}" data-action="nav" data-page="recommendations">PICK NEXT</button>
      </nav>
      <div class="topbar-spacer"></div>
      <div class="topbar-tools">
        <div class="connection-state"><span class="connection-dot"></span> CONNECTED</div>
        <button class="icon-button" data-action="nav" data-page="settings" aria-label="Settings">${icon("settings", 17)}</button>
        <button class="topbar-avatar" data-action="nav" data-page="settings" title="Account settings">${escapeHtml(initials(name))}</button>
      </div>
    </header>`;
}

function sideLink(label, page, iconName, active, count = "", filter = "") {
  const isWishlist = filter === "wishlist";
  const filteredLibraryLink = page === "library" && (Boolean(filter) || isWishlist);
  const filterAttribute = isWishlist ? 'data-acquisition="wishlist"' : filter && filter !== "all" ? `data-status="${filter}"` : "";
  return `<button class="side-link ${active ? "is-active" : ""}" data-action="${filteredLibraryLink ? "nav-filter" : "nav"}" data-page="${page}" ${filterAttribute}>
    <span class="side-link__icon">${icon(iconName, 16)}</span><span>${label}</span>${typeof count === "number" ? `<span class="side-link__count">${formatNumber(count)}</span>` : ""}
  </button>`;
}

function shellSidebar() {
  const stats = state.stats || {};
  const profileName = state.profile?.display_name || "Player";
  return `
    ${state.menuOpen ? '<button class="sidebar-scrim" data-action="toggle-menu" aria-label="Close navigation"></button>' : ""}
    <aside class="sidebar ${state.menuOpen ? "is-open" : ""}">
      <section class="sidebar-section">
        <div class="sidebar-label">Workspace</div>
        ${sideLink("Home", "home", "home", state.page === "home")}
        ${sideLink("All games", "library", "library", state.page === "library" && !state.filters.play_status && !state.filters.acquisition_status, stats.total_games ?? 0, "all")}
        ${sideLink("Pick next", "recommendations", "discover", state.page === "recommendations")}
      </section>
      <div class="sidebar-rule"></div>
      <section class="sidebar-section">
        <div class="sidebar-label">Your library</div>
        ${sideLink("Currently playing", "library", "play", state.page === "library" && state.filters.play_status === "playing", stats.playing_games ?? 0, "playing")}
        ${sideLink("Backlog", "library", "book", state.page === "library" && state.filters.play_status === "backlog", stats.backlog_games ?? 0, "backlog")}
        ${sideLink("Completed", "library", "check", state.page === "library" && state.filters.play_status === "completed", stats.completed_games ?? 0, "completed")}
        ${sideLink("Wishlist", "library", "discover", state.page === "library" && state.filters.acquisition_status === "wishlist", stats.wishlist_games ?? 0, "wishlist")}
      </section>
      <div class="sidebar-rule"></div>
      <section class="sidebar-section">
        <div class="sidebar-label">Manage</div>
        <button class="side-link" data-action="steam-preview"><span class="side-link__icon">${icon("steam", 16)}</span><span>Import from Steam</span></button>
        <button class="side-link ${state.page === "settings" ? "is-active" : ""}" data-action="nav" data-page="settings"><span class="side-link__icon">${icon("settings", 16)}</span><span>Settings</span></button>
      </section>
      <div class="sidebar-user">
        <div class="sidebar-user__avatar">${escapeHtml(initials(profileName))}</div>
        <div class="sidebar-user__details"><strong>${escapeHtml(profileName)}</strong><span>PERSONAL LIBRARY</span></div>
        <button class="icon-button" data-action="signout" aria-label="Sign out" title="Sign out">${icon("arrow", 15)}</button>
      </div>
    </aside>`;
}

function renderShell() {
  if (!state.session || !state.profile) return renderAuth();
  app.innerHTML = `${shellHeader()}${shellSidebar()}<main class="main"><div class="main-inner" id="page-content"></div></main>${renderModal()}`;
  renderPageContent();
}

function renderLoadingPage() {
  return `<div class="page-head"><div><div class="eyebrow">BACKLOG COMPASS / LOADING</div><h1 class="page-title">Your library</h1><p class="page-subtitle">Loading your games and activity.</p></div></div><div class="loading-line"></div><div class="game-grid" style="margin-top:20px">${Array.from({ length: 8 }, () => '<div class="skeleton skeleton-card"></div>').join("")}</div>`;
}

function renderPageContent() {
  const target = document.querySelector("#page-content");
  if (!target) return;
  if (state.page === "home") target.innerHTML = renderHome();
  else if (state.page === "library") target.innerHTML = renderLibrary();
  else if (state.page === "recommendations") target.innerHTML = renderRecommendationPage();
  else if (state.page === "settings") target.innerHTML = renderSettings();
}

function renderHome() {
  const stats = state.stats || {};
  const firstName = (state.profile?.display_name || "Player").split(/\s+/)[0];
  const playing = state.homePlaying?.[0];
  const recent = state.homeRecent || [];
  return `
    <div class="page-head"><div><div class="eyebrow">YOUR PERSONAL GAME LIBRARY</div><h1 class="page-title">Welcome back, ${escapeHtml(firstName)}</h1><p class="page-subtitle">Your collection, your progress, and a better answer to the question: what should I play next?</p></div><div class="page-actions"><button class="btn" data-action="steam-preview">${icon("steam", 15)} Import from Steam</button><button class="btn btn-primary" data-action="add-game">${icon("plus", 15)} Add a game</button></div></div>
    <section class="welcome-hero"><div class="welcome-hero__content"><div class="welcome-hero__kicker">THE LIBRARY IS YOURS</div><h2>Make time<br>for the good ones.</h2><p>Keep your collection in order, track the games you're making time for, and pick up where you left off.</p><div class="welcome-hero__actions"><button class="btn btn-primary" data-action="nav" data-page="library">Open library ${icon("arrow", 14)}</button><button class="btn btn-quiet" data-action="nav" data-page="recommendations">Find something to play</button></div></div></section>
    <section class="stats-strip" aria-label="Library statistics">
      <div class="stat-cell"><div class="stat-cell__label">Games tracked</div><strong class="stat-cell__value">${formatNumber(stats.total_games)}</strong><div class="stat-cell__foot">${formatNumber(stats.owned_games)} owned · ${formatNumber(stats.wishlist_games)} wishlist</div></div>
      <div class="stat-cell"><div class="stat-cell__label">In progress</div><strong class="stat-cell__value">${formatNumber(stats.playing_games)}</strong><div class="stat-cell__foot">Currently playing</div></div>
      <div class="stat-cell"><div class="stat-cell__label">Finished</div><strong class="stat-cell__value">${formatNumber(stats.completed_games)}</strong><div class="stat-cell__foot">Games completed</div></div>
      <div class="stat-cell"><div class="stat-cell__label">Time played</div><strong class="stat-cell__value">${formatMinutes((stats.total_steam_playtime_minutes || 0) + (stats.legacy_manual_playtime_minutes || 0) + (stats.manual_session_minutes || 0))}</strong><div class="stat-cell__foot">Steam + logged sessions</div></div>
    </section>
    <div class="home-grid">
      <section>
        <div class="section-heading"><h2>Pick up where you left off</h2><a data-action="nav" data-page="library">View library →</a></div>
        ${playing ? `<article class="continue-card" data-action="open-game" data-id="${escapeHtml(playing.id)}" tabindex="0" role="button" aria-label="Open ${escapeHtml(playing.name)}"><div class="continue-card__art"><div class="game-card__art-fallback"><span>${escapeHtml(initials(playing.name))}</span><small>BACKLOG COMPASS</small></div>${playing.steam_app_id ? `<img data-art src="${escapeHtml(appImage(playing.steam_app_id))}" alt="">` : ""}</div><div class="continue-card__body"><div class="continue-card__label">CURRENTLY PLAYING</div><h3>${escapeHtml(playing.name)}</h3><div class="continue-card__meta">${formatMinutes(playing.steam_playtime_minutes + playing.legacy_manual_playtime_minutes)} recorded · ${Number(playing.progress_percent || 0)}% progress</div><div class="progress-track"><span style="width:${Math.min(100, Math.max(0, Number(playing.progress_percent || 0)))}%"></span></div><div class="continue-card__foot"><span class="muted mono">${statusLabel(playing.play_status).toUpperCase()}</span><button class="btn btn-sm btn-primary" data-action="open-game" data-id="${escapeHtml(playing.id)}">View details ${icon("arrow", 12)}</button></div></div></article>` : `<div class="empty-panel"><strong>Nothing in progress.</strong><p>Move a game to “Currently playing” and it will show up here.</p><button class="btn btn-sm" data-action="nav-filter" data-page="library" data-status="backlog">Browse your backlog ${icon("arrow", 12)}</button></div>`}
        <div class="section-heading"><h2>Recently updated</h2><a data-action="nav" data-page="library">All games →</a></div>
        ${recent.length ? `<div class="surface"><div class="activity-list">${recent.slice(0,5).map((game) => `<div class="activity-row"><span class="activity-row__mark"></span><div class="activity-row__copy"><strong>${escapeHtml(game.name)}</strong><span>${statusLabel(game.play_status).toUpperCase()} · UPDATED ${escapeHtml(formatDate(game.updated_at).toUpperCase())}</span></div><button class="icon-button" data-action="open-game" data-id="${escapeHtml(game.id)}" aria-label="Open ${escapeHtml(game.name)}">${icon("arrow", 14)}</button></div>`).join("")}</div></div>` : `<div class="empty-panel"><strong>Your library starts here.</strong><p>Add a game manually or import your owned games from Steam.</p><button class="btn btn-sm btn-primary" data-action="add-game">${icon("plus", 13)} Add your first game</button></div>`}
      </section>
      <aside>
        <div class="section-heading"><h2>Library snapshot</h2></div>
        <div class="surface"><div class="surface-head"><h3 class="surface-title">Your collection</h3><span class="surface-kicker">BY STATUS</span></div><div class="activity-list">
          ${snapshotRow("Backlog", stats.backlog_games, "backlog", "book")}
          ${snapshotRow("Playing", stats.playing_games, "playing", "play")}
          ${snapshotRow("Paused", stats.paused_games, "paused", "clock")}
          ${snapshotRow("Completed", stats.completed_games, "completed", "check")}
          ${snapshotRow("Dropped", stats.dropped_games, "dropped", "close")}
          ${snapshotRow("Wishlist", stats.wishlist_games, "wishlist", "discover", true)}
        </div></div>
        <div class="section-heading"><h2>Steam connection</h2></div>
        <div class="surface" style="padding:16px"><div class="activity-row" style="padding-top:0"><span class="side-link__icon">${icon("steam", 19)}</span><div class="activity-row__copy"><strong>${state.profile?.steam_id ? "Steam ID linked" : "Steam not linked"}</strong><span>${state.profile?.steam_id ? `ID64 · ${escapeHtml(state.profile.steam_id)}` : "Add your SteamID64 in settings"}</span></div></div><button class="btn btn-sm" style="width:100%;margin-top:10px" data-action="${state.profile?.steam_id ? "steam-preview" : "nav"}" ${state.profile?.steam_id ? "" : 'data-page="settings"'}>${state.profile?.steam_id ? "Preview Steam library" : "Link Steam ID"} ${icon("arrow", 12)}</button></div>
      </aside>
    </div>`;
}

function snapshotRow(label, count, status, iconName, wishlist = false) {
  const active = Number(count || 0);
  return `<button class="activity-row" style="width:100%;text-align:left;background:transparent;border:0;cursor:pointer" data-action="nav-filter" data-page="library" ${wishlist ? 'data-acquisition="wishlist"' : `data-status="${status}"`}><span class="side-link__icon">${icon(iconName, 15)}</span><div class="activity-row__copy"><strong>${label}</strong><span>${wishlist ? "WANTS TO PLAY" : statusLabel(status).toUpperCase()}</span></div><span class="side-link__count">${formatNumber(active)}</span></button>`;
}

function renderLibrary() {
  const filters = state.filters;
  const pageStart = state.total ? state.offset + 1 : 0;
  const pageEnd = Math.min(state.offset + PAGE_SIZE, state.total);
  return `
    <div class="page-head"><div><div class="eyebrow">YOUR COLLECTION / ${filters.acquisition_status ? "WISHLIST" : filters.play_status ? statusLabel(filters.play_status).toUpperCase() : "ALL GAMES"}</div><h1 class="page-title">${filters.acquisition_status === "wishlist" ? "Wishlist" : filters.play_status ? statusLabel(filters.play_status) : "Your library"}</h1><p class="page-subtitle">Search, sort, and manage the games you own or want to play. Select any title to update its status or log a session.</p></div><div class="page-actions"><button class="btn" data-action="steam-preview">${icon("steam", 15)} Steam import</button><button class="btn btn-primary" data-action="add-game">${icon("plus", 15)} Add a game</button></div></div>
    <div class="library-toolbar">
      <div class="search-box">${icon("search", 15)}<input class="control-input" id="game-search" type="search" placeholder="Find a game…" value="${escapeHtml(filters.search)}" autocomplete="off"></div>
      <select class="control-select" id="platform-filter" aria-label="Platform"><option value="" ${!filters.platform ? "selected" : ""}>All platforms</option><option value="steam" ${filters.platform === "steam" ? "selected" : ""}>Steam</option><option value="other" ${filters.platform === "other" ? "selected" : ""}>Other</option></select>
      <select class="control-select" id="sort-filter" aria-label="Sort games"><option value="updated_at" ${filters.sort_by === "updated_at" ? "selected" : ""}>Recently updated</option><option value="name" ${filters.sort_by === "name" ? "selected" : ""}>Name</option><option value="priority" ${filters.sort_by === "priority" ? "selected" : ""}>Priority</option><option value="steam_playtime_minutes" ${filters.sort_by === "steam_playtime_minutes" ? "selected" : ""}>Playtime</option></select>
      <select class="control-select" id="order-filter" aria-label="Sort order"><option value="desc" ${filters.order === "desc" ? "selected" : ""}>Descending</option><option value="asc" ${filters.order === "asc" ? "selected" : ""}>Ascending</option></select>
      <span class="filter-count">${formatNumber(state.total)} ${state.total === 1 ? "GAME" : "GAMES"}</span>
    </div>
    <div class="filter-row" aria-label="Play status filter">
      ${filterChip("All", "", !filters.play_status && !filters.acquisition_status)}
      ${filterChip("Backlog", "backlog", filters.play_status === "backlog")}
      ${filterChip("Playing", "playing", filters.play_status === "playing")}
      ${filterChip("Paused", "paused", filters.play_status === "paused")}
      ${filterChip("Completed", "completed", filters.play_status === "completed")}
      ${filterChip("Dropped", "dropped", filters.play_status === "dropped")}
      ${filterChip("Wishlist", "wishlist", filters.acquisition_status === "wishlist", true)}
    </div>
    ${state.busy ? '<div class="loading-line" style="margin-bottom:14px"></div>' : ""}
    ${state.games.length ? `<div class="game-grid">${state.games.map(renderGameCard).join("")}</div>` : `<div class="empty-panel game-grid-empty"><strong>${filters.search || filters.play_status || filters.acquisition_status ? "No games match these filters." : "Your library is empty."}</strong><p>${filters.search || filters.play_status || filters.acquisition_status ? "Try a different search or clear the filters." : "Add a game manually or import your Steam library to get started."}</p><div style="display:flex;gap:7px;flex-wrap:wrap"><button class="btn btn-sm" data-action="clear-filters">Clear filters</button><button class="btn btn-sm btn-primary" data-action="add-game">${icon("plus", 13)} Add a game</button></div></div>`}
    <div class="pagination"><span>SHOWING ${pageStart}–${pageEnd} OF ${formatNumber(state.total)}</span><div class="pagination__actions"><button class="btn btn-sm" data-action="page-prev" ${state.offset <= 0 ? "disabled" : ""}>Previous</button><button class="btn btn-sm" data-action="page-next" ${state.offset + PAGE_SIZE >= state.total ? "disabled" : ""}>Next</button></div></div>`;
}

function filterChip(label, value, active, acquisition = false) {
  return `<button class="filter-chip ${active ? "is-active" : ""}" data-action="set-filter" ${acquisition ? 'data-acquisition="wishlist"' : `data-status="${value}"`}>${label}</button>`;
}

function renderGameCard(game) {
  const hours = Number(game.steam_playtime_minutes || 0) + Number(game.legacy_manual_playtime_minutes || 0);
  const flag = game.acquisition_status === "wishlist" ? "WISHLIST" : statusLabel(game.play_status).toUpperCase();
  const pct = Math.min(100, Math.max(0, Number(game.progress_percent || 0)));
  return `<article class="game-card" role="button" tabindex="0" data-action="open-game" data-id="${escapeHtml(game.id)}" aria-label="Open ${escapeHtml(game.name)}">${gameArt(game)}<span class="game-card__flag">${escapeHtml(flag)}</span><div class="game-card__body"><h3 class="game-card__name">${escapeHtml(game.name)}</h3><div class="game-card__sub"><span>${formatMinutes(hours)}</span><span>${game.acquisition_status === "wishlist" ? "WANTED" : `${pct}%`}</span></div>${game.acquisition_status === "wishlist" ? "" : `<div class="game-card__progress"><span style="width:${pct}%"></span></div>`}</div></article>`;
}

function renderRecommendationPage() {
  const recs = state.recommendations?.data || [];
  return `
    <div class="page-head"><div><div class="eyebrow">A LITTLE HELP DECIDING</div><h1 class="page-title">What should I play?</h1><p class="page-subtitle">A practical shortlist based on your priority, mood, available time, and current play status. No mystery ranking—each result explains why it appeared.</p></div></div>
    <div class="content-columns">
      <section class="surface"><div class="surface-head"><h2 class="surface-title">Set the mood</h2><span class="surface-kicker">YOUR SESSION</span></div><form class="form-panel" data-form="recommendations">
        <div class="field"><label for="recommend-mood">Mood tag</label><input class="control-input" id="recommend-mood" name="mood" maxlength="30" placeholder="e.g. cozy, competitive" value="${escapeHtml(state.recommendationQuery.mood)}"><span class="field-hint">Matches a mood tag you've added to a game. Leave blank to ignore.</span></div>
        <div class="field"><label for="recommend-time">Available time</label><select class="control-select" id="recommend-time" name="available_minutes"><option value="15" ${state.recommendationQuery.available_minutes === "15" ? "selected" : ""}>15 minutes</option><option value="30" ${state.recommendationQuery.available_minutes === "30" ? "selected" : ""}>30 minutes</option><option value="60" ${state.recommendationQuery.available_minutes === "60" ? "selected" : ""}>About an hour</option><option value="90" ${state.recommendationQuery.available_minutes === "90" ? "selected" : ""}>90 minutes</option><option value="120" ${state.recommendationQuery.available_minutes === "120" ? "selected" : ""}>2 hours</option><option value="240" ${state.recommendationQuery.available_minutes === "240" ? "selected" : ""}>A long session</option></select><span class="field-hint">Uses the typical session length you've set for each game.</span></div>
        <button class="btn btn-primary" type="submit" style="width:100%">Find my next game ${icon("arrow", 14)}</button>
      </form></section>      
      <section><div class="section-heading" style="margin-top:3px"><h2>Your shortlist</h2><span class="surface-kicker">${state.recommendations ? `${state.recommendations.total_candidates} ELIGIBLE GAMES` : "READY WHEN YOU ARE"}</span></div>
        ${state.busy ? '<div class="loading-line"></div>' : recs.length ? `<div class="recommendation-list">${recs.map(renderRecommendation).join("")}</div><p class="field-hint" style="margin-top:12px">${escapeHtml(state.recommendations.note || "")}</p>` : `<div class="empty-panel"><strong>${state.recommendations ? "No suitable games found." : "Let's find something."}</strong><p>${state.recommendations ? "Add owned games with Backlog, Playing, or Paused status to make them eligible." : "Choose a mood or time limit, then let your collection narrow it down."}</p><button class="btn btn-sm" data-action="nav" data-page="library">Browse your library ${icon("arrow", 12)}</button></div>`}
      </section>
    </div>`;
}

function renderRecommendation(item) {
  const game = item.game;
  return `<article class="recommendation-row" data-action="open-game" data-id="${escapeHtml(game.id)}" role="button" tabindex="0"><div class="recommendation-row__art"><div class="game-card__art-fallback"><span>${escapeHtml(initials(game.name))}</span></div>${game.steam_app_id ? `<img data-art src="${escapeHtml(appImage(game.steam_app_id))}" alt="${escapeHtml(game.name)}" loading="lazy">` : ""}</div><div class="recommendation-row__body"><strong>${escapeHtml(game.name)}</strong><span>${statusLabel(game.play_status)} · Priority ${item.priority}/5 · ${Math.round(item.progress_percent || 0)}% complete</span><div class="recommendation-row__reason">${(item.reasons || []).slice(0, 3).map(escapeHtml).join(" · ")}</div></div><div class="recommendation-score">${formatNumber(item.score)} pts</div></article>`;
}

function renderSettings() {
  const profile = state.profile || {};
  return `
    <div class="page-head"><div><div class="eyebrow">ACCOUNT / PREFERENCES</div><h1 class="page-title">Settings</h1><p class="page-subtitle">Manage your profile and Steam connection. Your library remains stored in your connected account.</p></div></div>
    <div class="settings-grid">
      <section class="surface settings-card"><div class="surface-head"><h2 class="surface-title">Your profile</h2><span class="surface-kicker">ACCOUNT DETAILS</span></div><div class="settings-card__body"><form data-form="profile"><div class="field"><label for="display-name">Display name</label><input class="control-input" id="display-name" name="display_name" maxlength="60" minlength="1" required value="${escapeHtml(profile.display_name || "")}"></div><div class="field"><label>Email</label><input class="control-input" value="${escapeHtml(profile.email || "")}" disabled><span class="field-hint">Email is managed by your sign-in provider.</span></div><button class="btn btn-primary" type="submit">Save profile</button></form></div></section>
      <section class="surface settings-card"><div class="surface-head"><h2 class="surface-title">Steam integration</h2><span class="surface-kicker">OWNED GAMES SYNC</span></div><div class="settings-card__body"><p class="settings-note">Link your 17-digit SteamID64 to preview and import the games Steam makes visible through its Web API. Your Steam password is never requested.</p><form data-form="steam-id"><div class="field"><label for="steam-id">SteamID64</label><input class="control-input mono" id="steam-id" name="steam_id" inputmode="numeric" pattern="[0-9]{17}" maxlength="17" placeholder="7656119…" value="${escapeHtml(profile.steam_id || "")}"><span class="field-hint">Use your numeric SteamID64, not your custom profile URL.</span></div><button class="btn btn-primary" type="submit">Save Steam ID</button></form><div class="sidebar-rule"></div><div class="info-line"><span>Last successful sync</span><strong>${escapeHtml(formatDate(state.stats?.last_steam_sync_at))}</strong></div><div class="info-line"><span>Games in library</span><strong>${formatNumber(state.stats?.total_games || 0)}</strong></div><button class="btn" style="width:100%;margin-top:14px" data-action="steam-preview">${icon("steam", 15)} Preview Steam library</button></div></section>
      <section class="surface settings-card"><div class="surface-head"><h2 class="surface-title">About this app</h2><span class="surface-kicker">BACKLOG COMPASS</span></div><div class="settings-card__body"><div class="info-line"><span>Application</span><strong>Backlog Compass</strong></div><div class="info-line"><span>API</span><strong>v2.0.0</strong></div><div class="info-line"><span>Data source</span><strong>Supabase / PostgreSQL</strong></div><p class="settings-note" style="margin:14px 0 0">Steam playtime is read from Steam. Additional play sessions logged here are tracked separately by Backlog Compass.</p></div></section>
      <section class="surface settings-card"><div class="surface-head"><h2 class="surface-title">Session</h2><span class="surface-kicker">SECURITY</span></div><div class="settings-card__body"><p class="settings-note">Sign out to clear this browser's saved session. Your library records are not deleted.</p><button class="btn btn-danger" data-action="signout">Sign out of Backlog Compass</button></div></section>
    </div>`;
}

function renderModal() {
  if (!state.modal) return "";
  const modal = state.modal;
  if (modal.type === "game-form") return renderGameFormModal(modal.game);
  if (modal.type === "detail") return renderDetailModal();
  if (modal.type === "session-form") return renderSessionModal(modal.game);
  if (modal.type === "steam-preview") return renderSteamPreviewModal();
  if (modal.type === "confirm-delete") return renderDeleteModal(modal.game);
  return "";
}

function renderGameFormModal(game = null) {
  const editing = Boolean(game);
  const values = game || {};
  return `<div class="dialog-backdrop" data-action="backdrop-close"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="game-form-title"><div class="dialog-head"><div><h2 id="game-form-title">${editing ? "Edit library entry" : "Add a game"}</h2><p>${editing ? "Update how this game fits into your library." : "Add a Steam title or a game from another platform."}</p></div><button class="icon-button" data-action="close-modal" aria-label="Close">${icon("close", 17)}</button></div><form data-form="${editing ? "edit-game" : "add-game"}" data-id="${escapeHtml(values.id || "")}"><div class="dialog-body"><div class="form-grid">
    ${editing ? "" : `<div class="field"><label for="game-platform">Platform</label><select class="control-select" id="game-platform" name="platform"><option value="steam">Steam</option><option value="other">Other</option></select></div>`}
    <div class="field ${editing ? "field--full" : ""}"><label for="game-name">Game title</label><input class="control-input" id="game-name" name="name" maxlength="200" required value="${escapeHtml(values.name || "")}" ${editing ? "disabled" : ""}></div>
    ${editing ? "" : `<div class="field" id="steam-app-field"><label for="steam-app-id">Steam App ID</label><input class="control-input mono" id="steam-app-id" name="steam_app_id" inputmode="numeric" pattern="[0-9]+" required placeholder="e.g. 413150"><span class="field-hint">Required for Steam games.</span></div><div class="field" id="store-url-field"><label for="store-url">Store URL <span class="muted">(optional)</span></label><input class="control-input" id="store-url" name="store_url" type="url" placeholder="https://…"></div>`}
    <div class="field"><label for="game-acquisition">Collection</label><select class="control-select" id="game-acquisition" name="acquisition_status"><option value="owned" ${values.acquisition_status !== "wishlist" ? "selected" : ""}>Owned</option><option value="wishlist" ${values.acquisition_status === "wishlist" ? "selected" : ""}>Wishlist</option></select></div>
    <div class="field"><label for="game-status">Play status</label><select class="control-select" id="game-status" name="play_status">${["backlog","playing","paused","completed","dropped"].map((status) => `<option value="${status}" ${(values.play_status || "backlog") === status ? "selected" : ""}>${statusLabel(status)}</option>`).join("")}</select></div>
    <div class="field"><label for="game-priority">Priority</label><select class="control-select" id="game-priority" name="priority">${[1,2,3,4,5].map((n) => `<option value="${n}" ${(Number(values.priority || 3) === n) ? "selected" : ""}>${n} / 5${n === 5 ? " · Highest" : n === 1 ? " · Lowest" : ""}</option>`).join("")}</select></div>
    <div class="field"><label for="game-progress">Progress (%)</label><input class="control-input" id="game-progress" name="progress_percent" type="number" min="0" max="100" step="1" value="${Number(values.progress_percent || 0)}"></div>
    <div class="field"><label for="game-session-length">Typical session (minutes)</label><input class="control-input" id="game-session-length" name="typical_session_minutes" type="number" min="5" max="1440" placeholder="e.g. 45" value="${values.typical_session_minutes ?? ""}"></div>
    <div class="field"><label for="game-remaining">Time remaining (minutes)</label><input class="control-input" id="game-remaining" name="estimated_remaining_minutes" type="number" min="0" max="2147483647" placeholder="Optional" value="${values.estimated_remaining_minutes ?? ""}"></div>
    <div class="field field--full"><label for="game-tags">Mood tags</label><input class="control-input" id="game-tags" name="mood_tags" maxlength="320" placeholder="cozy, story-rich, competitive" value="${escapeHtml((values.mood_tags || []).join(", "))}"><span class="field-hint">Comma-separated. These help the recommendation shortlist match your mood.</span></div>
    <div class="field field--full"><label for="game-notes">Personal notes</label><textarea class="control-textarea" id="game-notes" name="notes" maxlength="2000" placeholder="Where you left off, what you want to try next…">${escapeHtml(values.notes || "")}</textarea></div>
  </div></div><div class="dialog-foot"><button class="btn" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">${editing ? "Save changes" : "Add to library"}</button></div></form></section></div>`;
}

function renderDetailModal() {
  const game = state.selectedGame;
  if (!game) return "";
  const loggedSessionMinutes = state.sessions.reduce((sum, session) => sum + Number(session.duration_minutes || 0), 0);
  const played = Number(game.steam_playtime_minutes || 0) + Number(game.legacy_manual_playtime_minutes || 0) + loggedSessionMinutes;
  const header = game.steam_app_id ? `<img class="detail-hero__image" data-art src="${escapeHtml(appImage(game.steam_app_id, "header"))}" alt="">` : "";
  return `<div class="dialog-backdrop" data-action="backdrop-close"><section class="dialog dialog--wide" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div class="detail-hero">${header}<div class="detail-hero__content"><div class="eyebrow">${game.acquisition_status === "wishlist" ? "WISHLIST ENTRY" : statusLabel(game.play_status).toUpperCase()} / ${game.platform.toUpperCase()}</div><h2 id="detail-title">${escapeHtml(game.name)}</h2><div class="detail-hero__meta"><span>${game.acquisition_status === "wishlist" ? "WISHLIST" : "OWNED"}</span><span>·</span><span>PRIORITY ${game.priority}/5</span><span>·</span><span>ADDED ${escapeHtml(formatDate(game.created_at).toUpperCase())}</span></div></div><button class="icon-button" style="position:absolute;z-index:2;top:12px;right:12px;color:#fff;background:rgba(7,14,20,.5)" data-action="close-modal" aria-label="Close">${icon("close", 17)}</button></div>
    <div class="detail-layout"><div><h3 class="detail-section-title">Progress & notes</h3><div class="progress-track" style="height:6px;margin:0 0 8px"><span style="width:${Math.min(100,Math.max(0,Number(game.progress_percent || 0)))}%"></span></div><div class="detail-copy">${game.notes ? escapeHtml(game.notes) : "No personal notes yet."}</div>${game.mood_tags?.length ? `<div class="filter-row" style="margin:12px 0 0">${game.mood_tags.map((tag) => `<span class="filter-chip">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}<div class="session-list"><div class="section-heading" style="margin:15px 0 5px"><h2 style="font-size:16px">Recent sessions</h2><button class="btn btn-sm" data-action="log-session" data-id="${escapeHtml(game.id)}">${icon("plus", 12)} Log session</button></div>${state.sessions.length ? state.sessions.map(renderSessionRow).join("") : `<p class="field-hint">No sessions logged for this game yet.</p>`}</div></div>
    <aside><div class="detail-stats"><div class="detail-stat"><span>Total playtime</span><strong>${formatMinutes(played)}</strong></div><div class="detail-stat"><span>Progress</span><strong>${Math.round(Number(game.progress_percent || 0))}%</strong></div><div class="detail-stat"><span>Steam time</span><strong>${formatMinutes(game.steam_playtime_minutes)}</strong></div><div class="detail-stat"><span>Remaining</span><strong>${game.estimated_remaining_minutes == null ? "—" : formatMinutes(game.estimated_remaining_minutes)}</strong></div></div><div class="detail-actions"><button class="btn btn-primary" style="flex:1" data-action="log-session" data-id="${escapeHtml(game.id)}">${icon("clock", 14)} Log play session</button><button class="btn" data-action="edit-game" data-id="${escapeHtml(game.id)}">${icon("edit", 14)}</button></div>${safeHttpUrl(game.store_url) ? `<div class="detail-actions"><a class="btn" style="width:100%" href="${escapeHtml(safeHttpUrl(game.store_url))}" target="_blank" rel="noopener noreferrer">Open store page ${icon("arrow", 12)}</a></div>` : ""}<div class="detail-actions"><button class="btn btn-danger" style="width:100%" data-action="delete-game" data-id="${escapeHtml(game.id)}">${icon("trash", 14)} Remove from library</button></div><div class="info-line" style="margin-top:16px"><span>Last Steam sync</span><strong>${escapeHtml(formatDate(game.steam_last_synced_at))}</strong></div><div class="info-line"><span>Last updated</span><strong>${escapeHtml(formatDate(game.updated_at))}</strong></div></aside></div>
  </section></div>`;
}

function renderSessionRow(session) {
  return `<div class="session-row"><div><strong>${escapeHtml(formatDate(session.played_at))}${session.mood ? ` · ${escapeHtml(session.mood)}` : ""}</strong><span>${session.notes ? escapeHtml(session.notes) : "Session recorded"}</span></div><div class="session-row__time">${formatMinutes(session.duration_minutes)}</div></div>`;
}

function renderSessionModal(game) {
  return `<div class="dialog-backdrop" data-action="backdrop-close"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="session-title"><div class="dialog-head"><div><h2 id="session-title">Log a play session</h2><p>${escapeHtml(game.name)}</p></div><button class="icon-button" data-action="close-modal" aria-label="Close">${icon("close", 17)}</button></div><form data-form="add-session" data-id="${escapeHtml(game.id)}"><div class="dialog-body"><div class="field"><label for="session-duration">Duration (minutes)</label><input class="control-input" id="session-duration" name="duration_minutes" type="number" min="1" max="1440" required placeholder="e.g. 75"></div><div class="field"><label for="session-played-at">When</label><input class="control-input" id="session-played-at" name="played_at" type="datetime-local"></div><div class="field"><label for="session-mood">Mood <span class="muted">(optional)</span></label><input class="control-input" id="session-mood" name="mood" maxlength="40" placeholder="e.g. relaxed"></div><div class="field"><label for="session-notes">Notes <span class="muted">(optional)</span></label><textarea class="control-textarea" id="session-notes" name="notes" maxlength="1000" placeholder="What did you do? Where should you pick up next time?"></textarea></div></div><div class="dialog-foot"><button class="btn" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">Save session</button></div></form></section></div>`;
}
function renderSteamPreviewModal() {
  const preview = state.steamPreview;
  return `<div class="dialog-backdrop" data-action="backdrop-close"><section class="dialog dialog--wide" role="dialog" aria-modal="true" aria-labelledby="steam-preview-title"><div class="dialog-head"><div><h2 id="steam-preview-title">Import from Steam</h2><p>Review the games Steam makes visible before syncing them into your collection.</p></div><button class="icon-button" data-action="close-modal" aria-label="Close">${icon("close", 17)}</button></div><div class="dialog-body">${!preview ? '<div class="loading-line"></div><p class="field-hint" style="margin-top:12px">Checking your Steam library…</p>' : preview.warning ? `<div class="empty-panel"><strong>Steam returned no games.</strong><p>${escapeHtml(preview.warning)}</p><button class="btn btn-sm" data-action="nav" data-page="settings">Check Steam settings</button></div>` : `<div class="stats-strip" style="margin:0 0 15px;grid-template-columns:repeat(2,minmax(0,1fr))"><div class="stat-cell"><div class="stat-cell__label">Games found</div><strong class="stat-cell__value">${formatNumber(preview.total_games)}</strong></div><div class="stat-cell"><div class="stat-cell__label">Import method</div><strong class="stat-cell__value" style="font-size:20px">STEAM API</strong></div></div><p class="settings-note">Sync adds missing owned titles, updates Steam-managed playtime, and converts matching wishlist entries to owned. It does not delete games missing from this response or overwrite personal notes.</p><div class="surface"><div class="activity-list">${(preview.games || []).slice(0, 8).map((game) => `<div class="activity-row"><span class="activity-row__mark"></span><div class="activity-row__copy"><strong>${escapeHtml(game.name)}</strong><span>APP ${escapeHtml(game.appid)} · ${formatMinutes(game.playtime_forever)} PLAYED</span></div></div>`).join("") || '<p class="field-hint">No preview entries returned.</p>'}</div></div>${preview.total_games > 8 ? `<p class="field-hint" style="margin-top:9px">Showing 8 of ${formatNumber(preview.total_games)} games.</p>` : ""}`}</div><div class="dialog-foot"><button class="btn" data-action="close-modal">Close</button>${preview && !preview.warning ? `<button class="btn btn-primary" data-action="steam-sync">${icon("steam", 14)} Sync ${formatNumber(preview.total_games)} games</button>` : ""}</div></section></div>`;
}

function renderDeleteModal(game) {
  return `<div class="dialog-backdrop" data-action="backdrop-close"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title"><div class="dialog-head"><div><h2 id="delete-title">Remove this game?</h2><p>${escapeHtml(game.name)}</p></div><button class="icon-button" data-action="close-modal" aria-label="Close">${icon("close", 17)}</button></div><div class="dialog-body"><p class="settings-note" style="margin:0">This removes the entry and its logged sessions from Backlog Compass. It does not uninstall the game or change your Steam ownership.</p></div><div class="dialog-foot"><button class="btn" data-action="close-modal">Keep game</button><button class="btn btn-danger" data-action="confirm-delete" data-id="${escapeHtml(game.id)}">${icon("trash", 13)} Remove game</button></div></section></div>`;
}

function renderAuth(error = "", message = "") {
  const mode = state.authMode || "signin";
  const isSignup = mode === "signup";
  const isRecovery = mode === "recovery";
  const isReset = mode === "reset";
  app.innerHTML = `<main class="auth-screen"><section class="auth-feature"><div class="auth-brand"><div class="brand-mark"><span class="brand-mark__glyph">B</span></div><div class="brand-name"><strong>BACKLOG COMPASS</strong><span>YOUR GAME LIBRARY</span></div></div><div class="auth-feature-copy"><div class="eyebrow">A BETTER WAY THROUGH YOUR BACKLOG</div><h1>Own your<br><span>next session.</span></h1><p>Your Steam collection, your real-world time, and a clear place to pick up where you left off. No noise. Just your games.</p></div><div class="auth-feature-foot">PERSONAL LIBRARY · STEAM INTEGRATION · PLAY SESSION TRACKING</div></section><section class="auth-panel"><div class="auth-box"><div class="eyebrow">BACKLOG COMPASS / ACCOUNT</div><h2>${isReset ? "Choose a new password" : isRecovery ? "Reset password" : isSignup ? "Create your account" : "Welcome back"}</h2><p>${isReset ? "Choose a new password for your Backlog Compass account." : isRecovery ? "Enter your email and we'll send you a password reset link." : isSignup ? "Set up your library and start organising what you want to play." : "Sign in to pick up where your library left off."}</p>${!isRecovery && !isReset ? `<div class="auth-tabs"><button class="auth-tab ${!isSignup ? "is-active" : ""}" data-action="auth-mode" data-mode="signin">Sign in</button><button class="auth-tab ${isSignup ? "is-active" : ""}" data-action="auth-mode" data-mode="signup">Create account</button></div>` : ""}${error ? `<div class="auth-error" role="alert">${escapeHtml(error)}</div>` : ""}${message ? `<div class="auth-error" style="border-color:rgba(121,189,140,.25);background:rgba(70,130,85,.1);color:#a8d7b4">${escapeHtml(message)}</div>` : ""}<form data-form="${isReset ? "reset" : isRecovery ? "recovery" : isSignup ? "signup" : "signin"}">${isRecovery ? `<div class="field"><label for="auth-email">Email</label><input class="control-input" id="auth-email" name="email" type="email" autocomplete="email" required placeholder="you@example.com"></div>` : isReset ? `<div class="field"><label for="auth-password">New password</label><input class="control-input" id="auth-password" name="password" type="password" minlength="6" autocomplete="new-password" required placeholder="At least 6 characters"></div>` : `<div class="field"><label for="auth-email">Email</label><input class="control-input" id="auth-email" name="email" type="email" autocomplete="email" required placeholder="you@example.com"></div><div class="field"><label for="auth-password">Password</label><input class="control-input" id="auth-password" name="password" type="password" minlength="6" autocomplete="${isSignup ? "new-password" : "current-password"}" required placeholder="${isSignup ? "At least 6 characters" : "Your password"}"></div>`}<button class="btn btn-primary" type="submit" style="width:100%;margin-top:4px">${isReset ? "Update password" : isRecovery ? "Send reset link" : isSignup ? "Create account" : "Sign in"} ${icon("arrow", 14)}</button></form><div class="auth-footnote">${isRecovery || isReset ? `<a class="text-link" data-action="auth-mode" data-mode="signin">Back to sign in</a>` : `<a class="text-link" data-action="auth-mode" data-mode="recovery">Forgot your password?</a><br><br>By continuing, you agree to use this library for your own account. Your Steam password is never requested.`}</div></div></section></main>`;
}

async function loadHome() {
  try {
    state.busy = true;
    const [stats, recent, playing] = await Promise.all([
      api("/games/stats"),
      api("/games?limit=5&offset=0&sort_by=updated_at&order=desc"),
      api("/games?limit=1&offset=0&play_status=playing&sort_by=updated_at&order=desc"),
    ]);
    state.stats = stats;
    state.homeRecent = recent.data || [];
    state.homePlaying = playing.data || [];
    state.busy = false;
    renderShell();
    renderPageContent();
  } catch (error) {
    state.busy = false;
    toast(error.message, "error");
  }
}

async function loadLibrary() {
  try {
    state.busy = true;
    if (state.page === "library") renderPageContent();
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(state.offset), sort_by: state.filters.sort_by, order: state.filters.order });
    if (state.filters.search.trim()) params.set("search", state.filters.search.trim());
    if (state.filters.play_status) params.set("play_status", state.filters.play_status);
    if (state.filters.acquisition_status) params.set("acquisition_status", state.filters.acquisition_status);
    if (state.filters.platform) params.set("platform", state.filters.platform);
    const [result, stats] = await Promise.all([api(`/games?${params.toString()}`), api("/games/stats")]);
    state.games = result.data || [];
    state.total = Number(result.total || 0);
    state.stats = stats;
    state.busy = false;
    renderPageContent();
    updateSidebar();
  } catch (error) {
    state.busy = false;
    toast(error.message, "error");
  }
}

function updateSidebar() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;
  const fresh = document.createElement("div");
  fresh.innerHTML = shellSidebar();
  const newSidebar = fresh.querySelector(".sidebar");
  if (newSidebar) sidebar.replaceWith(newSidebar);
}

async function loadRecommendations() {
  renderPageContent();
}

async function runRecommendations(query = state.recommendationQuery) {
  state.recommendationQuery = query;
  state.busy = true;
  state.recommendations = null;
  renderPageContent();
  try {
    const params = new URLSearchParams({ limit: "5" });
    if (query.mood?.trim()) params.set("mood", query.mood.trim().toLowerCase());
    if (query.available_minutes) params.set("available_minutes", query.available_minutes);
    state.recommendations = await api(`/recommendations/next?${params.toString()}`);
  } catch (error) {
    toast(error.message, "error");
  } finally {
    state.busy = false;
    renderPageContent();
  }
}

async function openGame(id) {
  const game = state.games.find((entry) => entry.id === id) || state.homeRecent?.find((entry) => entry.id === id) || state.homePlaying?.find((entry) => entry.id === id) || state.recommendations?.data?.find((entry) => entry.game.id === id)?.game;
  state.selectedGame = game || null;
  state.sessions = [];
  state.modal = { type: "detail" };
  renderShell();
  if (!game) return;
  try {
    const [fresh, sessions] = await Promise.all([api(`/games/${encodeURIComponent(id)}`), api(`/games/${encodeURIComponent(id)}/sessions?limit=6&offset=0`)]);
    state.selectedGame = fresh;
    state.sessions = sessions.data || [];
    state.modal = { type: "detail" };
    renderShell();
  } catch (error) {
    toast(error.message, "error");
  }
}

function openGameForm(game = null) {
  state.modal = { type: "game-form", game };
  renderShell();
}

async function openSteamPreview() {
  state.steamPreview = null;
  state.modal = { type: "steam-preview" };
  renderShell();
  try {
    state.steamPreview = await api("/steam/owned-games");
  } catch (error) {
    state.steamPreview = { total_games: 0, games: [], warning: error.message };
  }
  renderShell();
}
async function syncSteam() {
  const button = document.querySelector('[data-action="steam-sync"]');
  if (button) { button.disabled = true; button.textContent = "Syncing…"; }
  try {
    const result = await api("/steam/sync", { method: "POST" });
    toast(`${result.message}. Processed ${formatNumber(result.records_processed)} records.`, "success");
    state.modal = null;
    renderShell();
    await refreshCurrentPage();
  } catch (error) {
    toast(error.message, "error");
    if (state.steamPreview) renderShell();
  }
}

async function refreshCurrentPage() {
  if (state.page === "home") await loadHome();
  else if (state.page === "library") await loadLibrary();
  else if (state.page === "recommendations") await runRecommendations();
  else {
    try { state.stats = await api("/games/stats"); } catch { /* Settings can still render. */ }
    renderPageContent();
  }
}

async function signOut() {
  const refreshToken = state.session?.refresh_token;
  if (refreshToken && state.config) {
    try {
      await fetch(`${state.config.supabase_url.replace(/\/$/, "")}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: state.config.supabase_publishable_key, Authorization: `Bearer ${state.session.access_token}` },
      });
    } catch { /* Local sign-out still completes if the provider is unreachable. */ }
  }
  clearSession();
  state.modal = null;
  renderAuth();
}

function formDataObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function optionalNumber(value) {
  if (value === "" || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function submitAuth(form, type) {
  const values = formDataObject(form);
  try {
    const button = form.querySelector('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = "Please wait…"; }
    if (type === "recovery") {
      const redirectTo = `${window.location.origin}/`;
      await supabaseAuth(`recover?redirect_to=${encodeURIComponent(redirectTo)}`, { email: values.email });
      state.authMessage = "Password reset email sent. Check your inbox for the link.";
      renderAuth("", state.authMessage);
      return;
    }
    if (type === "reset") {
      const response = await fetch(`${state.config.supabase_url.replace(/\/$/, "")}/auth/v1/user`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", apikey: state.config.supabase_publishable_key, Authorization: `Bearer ${state.session.access_token}` },
        body: JSON.stringify({ password: values.password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorMessage(result, "Could not update your password."));
      clearSession();
      state.authMode = "signin";
      renderAuth("", "Password updated. Sign in with your new password.");
      return;
    }
    const payload = type === "signup"
      ? await supabaseAuth("signup", { email: values.email, password: values.password })
      : await supabaseAuth("token?grant_type=password", { email: values.email, password: values.password });
    if (!payload.access_token) {
      state.authMessage = "Account created. Check your email to confirm your address, then sign in.";
      state.authMode = "signin";
      renderAuth("", state.authMessage);
      return;
    }
    saveSession({ ...payload, expires_at: payload.expires_at ? payload.expires_at * 1000 : Date.now() + (payload.expires_in || 3600) * 1000 });
    await enterApp();
  } catch (error) {
    renderAuth(error.message);
  }
}

async function enterApp() {
  try {
    state.profile = await api("/me");
    state.page = "home";
    state.filters = { search: "", play_status: "", acquisition_status: "", platform: "", sort_by: "updated_at", order: "desc" };
    state.stats = await api("/games/stats");
    renderShell();
    await loadHome();
  } catch (error) {
    clearSession();
    renderAuth(error.message || "Could not load your profile.");
  }
}

async function handleAddGame(form) {
  const values = formDataObject(form);
  const platform = values.platform || "steam";
  const name = values.name.trim();
  const payload = {
    platform,
    name,
    steam_app_id: platform === "steam" ? optionalNumber(values.steam_app_id) : null,
    store_url: values.store_url?.trim() || null,
    acquisition_status: values.acquisition_status,
    play_status: values.play_status,
    priority: Number(values.priority),
    mood_tags: values.mood_tags ? values.mood_tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [],
    typical_session_minutes: optionalNumber(values.typical_session_minutes),
    estimated_remaining_minutes: optionalNumber(values.estimated_remaining_minutes),
    progress_percent: Number(values.progress_percent || 0),
    notes: values.notes?.trim() || null,
  };
  await api("/games", { method: "POST", body: JSON.stringify(payload) });
  state.modal = null;
  renderShell();
  toast(`${name} added to your library.`, "success");
  await refreshCurrentPage();
}

async function handleEditGame(form) {
  const values = formDataObject(form);
  const payload = {
    acquisition_status: values.acquisition_status,
    play_status: values.play_status,
    priority: Number(values.priority),
    mood_tags: values.mood_tags ? values.mood_tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [],
    typical_session_minutes: optionalNumber(values.typical_session_minutes),
    estimated_remaining_minutes: optionalNumber(values.estimated_remaining_minutes),
    progress_percent: Number(values.progress_percent || 0),
    notes: values.notes?.trim() || null,
  };
  const id = form.dataset.id;
  const updated = await api(`/games/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
  state.selectedGame = updated;
  state.modal = { type: "detail" };
  toast("Library entry updated.", "success");
  await refreshCurrentPage();
  if (state.page !== "home") {
    state.modal = { type: "detail" };
    renderShell();
    const result = await api(`/games/${encodeURIComponent(id)}/sessions?limit=6&offset=0`);
    state.sessions = result.data || [];
    renderShell();
  }
}

async function handleAddSession(form) {
  const values = formDataObject(form);
  const playedAt = values.played_at ? new Date(values.played_at).toISOString() : new Date().toISOString();
  const payload = {
    duration_minutes: Number(values.duration_minutes),
    played_at: playedAt,
    mood: values.mood?.trim() || null,
    notes: values.notes?.trim() || null,
  };
  const id = form.dataset.id;
  await api(`/games/${encodeURIComponent(id)}/sessions`, { method: "POST", body: JSON.stringify(payload) });
  toast("Play session logged.", "success");
  state.modal = { type: "detail" };
  await refreshCurrentPage();
  state.selectedGame = await api(`/games/${encodeURIComponent(id)}`);
  const result = await api(`/games/${encodeURIComponent(id)}/sessions?limit=6&offset=0`);
  state.sessions = result.data || [];
  state.modal = { type: "detail" };
  renderShell();
}

async function handleProfileSave(form, type) {
  const values = formDataObject(form);
  if (type === "profile") {
    state.profile = await api("/me", { method: "PATCH", body: JSON.stringify({ display_name: values.display_name.trim() }) });
    toast("Profile saved.", "success");
  } else {
    const steamId = values.steam_id.trim();
    if (steamId && !/^\d{17}$/.test(steamId)) throw new Error("SteamID64 must contain exactly 17 digits.");
    state.profile = await api("/me", { method: "PATCH", body: JSON.stringify({ steam_id: steamId || null }) });
    toast(steamId ? "Steam ID linked." : "Steam ID cleared.", "success");
  }
  renderShell();
  renderPageContent();
}
async function handleSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const type = form.dataset.form;
  const button = form.querySelector('button[type="submit"]');
  try {
    if (button) { button.disabled = true; button.dataset.originalText = button.textContent; button.textContent = "Saving…"; }
    if (["signin", "signup", "recovery"].includes(type)) await submitAuth(form, type);
    else if (type === "add-game") await handleAddGame(form);
    else if (type === "edit-game") await handleEditGame(form);
    else if (type === "add-session") await handleAddSession(form);
    else if (type === "profile" || type === "steam-id") await handleProfileSave(form, type);
    else if (type === "recommendations") {
      const values = formDataObject(form);
      await runRecommendations({ mood: values.mood || "", available_minutes: values.available_minutes || "" });
    }
  } catch (error) {
    toast(error.message, "error");
    if (button) { button.disabled = false; button.textContent = button.dataset.originalText || "Try again"; }
  }
}

async function handleAction(button) {
  const action = button.dataset.action;
  if (!action) return;
  const id = button.dataset.id;
  if (action === "nav") { setPage(button.dataset.page); return; }
  if (action === "nav-filter") {
    state.filters.play_status = button.dataset.status || "";
    state.filters.acquisition_status = button.dataset.acquisition || "";
    state.filters.search = "";
    state.page = "library";
    state.offset = 0;
    state.menuOpen = false;
    renderShell();
    await loadLibrary();
    return;
  }
  if (action === "toggle-menu") { state.menuOpen = !state.menuOpen; renderShell(); renderPageContent(); return; }
  if (action === "signout") { await signOut(); return; }
  if (action === "add-game") { openGameForm(); return; }
  if (action === "close-modal") { state.modal = null; renderShell(); return; }
  if (action === "backdrop-close") { state.modal = null; renderShell(); return; }
  if (action === "open-game") { await openGame(id); return; }
  if (action === "edit-game") {
    const game = state.selectedGame || state.games.find((entry) => entry.id === id) || state.homeRecent?.find((entry) => entry.id === id);
    if (game) openGameForm(game);
    return;
  }
  if (action === "log-session") {
    const game = state.selectedGame || state.games.find((entry) => entry.id === id) || state.homePlaying?.find((entry) => entry.id === id);
    if (game) { state.modal = { type: "session-form", game }; renderShell(); }
    return;
  }
  if (action === "delete-game") {
    const game = state.selectedGame || state.games.find((entry) => entry.id === id);
    if (game) { state.modal = { type: "confirm-delete", game }; renderShell(); }
    return;
  }
  if (action === "confirm-delete") {
    await api(`/games/${encodeURIComponent(id)}`, { method: "DELETE" });
    state.modal = null;
    state.selectedGame = null;
    renderShell();
    toast("Game removed from your library.", "success");
    await refreshCurrentPage();
    return;
  }
  if (action === "steam-preview") { await openSteamPreview(); return; }
  if (action === "steam-sync") { await syncSteam(); return; }
  if (action === "auth-mode") { state.authMode = button.dataset.mode; state.authMessage = ""; renderAuth(); return; }
  if (action === "set-filter") {
    state.filters.play_status = button.dataset.status || "";
    state.filters.acquisition_status = button.dataset.acquisition || "";
    state.offset = 0;
    await loadLibrary();
    return;
  }
  if (action === "clear-filters") {
    state.filters = { search: "", play_status: "", acquisition_status: "", platform: "", sort_by: "updated_at", order: "desc" };
    state.offset = 0;
    await loadLibrary();
    return;
  }
  if (action === "page-prev") { state.offset = Math.max(0, state.offset - PAGE_SIZE); await loadLibrary(); return; }
  if (action === "page-next") { state.offset += PAGE_SIZE; await loadLibrary(); return; }
}

async function handleChange(event) {
  const target = event.target;
  if (target.id === "platform-filter") { state.filters.platform = target.value; state.offset = 0; await loadLibrary(); }
  if (target.id === "sort-filter") { state.filters.sort_by = target.value; state.offset = 0; await loadLibrary(); }
  if (target.id === "order-filter") { state.filters.order = target.value; state.offset = 0; await loadLibrary(); }
  if (target.id === "game-platform") {
    const isSteam = target.value === "steam";
    const appField = document.querySelector("#steam-app-field");
    if (appField) appField.classList.toggle("hidden", !isSteam);
    const appInput = document.querySelector("#steam-app-id");
    if (appInput) appInput.required = isSteam;
  }
}

let searchTimer = null;
function handleInput(event) {
  if (event.target.id !== "game-search") return;
  state.filters.search = event.target.value;
  state.offset = 0;
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => loadLibrary(), 260);
}

function handleImageEvent(event) {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.matches("img[data-art]")) return;
  if (event.type === "load") {
    image.style.display = "block";
    const fallback = image.parentElement?.querySelector(".game-card__art-fallback");
    if (fallback) fallback.style.display = "none";
  } else if (event.type === "error") {
    image.remove();
  }
}

function handleKeydown(event) {
  if (event.key === "Escape" && state.modal) { state.modal = null; renderShell(); return; }
  if (event.key === "Tab" && state.modal) {
    const focusable = [...app.querySelectorAll('.dialog button:not(:disabled), .dialog input:not(:disabled), .dialog select:not(:disabled), .dialog textarea:not(:disabled), .dialog a[href]')].filter((node) => node.offsetParent !== null);
    if (focusable.length) {
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }
  if ((event.key === "Enter" || event.key === " ") && event.target.matches('[data-action="open-game"]')) {
    event.preventDefault();
    handleAction(event.target);
  }
}

app.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "backdrop-close" && event.target !== button) return;
  handleAction(button).catch((error) => toast(error.message, "error"));
});
app.addEventListener("submit", handleSubmit);
app.addEventListener("change", (event) => handleChange(event).catch((error) => toast(error.message, "error")));
app.addEventListener("input", handleInput);
app.addEventListener("load", handleImageEvent, true);
app.addEventListener("error", handleImageEvent, true);
app.addEventListener("keydown", handleKeydown);

async function boot() {
  try {
    await loadConfig();
    const recoveryHash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (recoveryHash.get("type") === "recovery" && recoveryHash.get("access_token")) {
      saveSession({
        access_token: recoveryHash.get("access_token"),
        refresh_token: recoveryHash.get("refresh_token") || "",
        expires_at: Date.now() + Number(recoveryHash.get("expires_in") || 3600) * 1000,
      });
      state.authMode = "reset";
      window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
      renderAuth();
      return;
    }
    state.session = readSession();
    if (!state.session?.access_token) {
      renderAuth();
      return;
    }
    if (state.session.expires_at && state.session.expires_at < Date.now() + 60_000) {
      const refreshed = await refreshAuthToken();
      if (!refreshed) { renderAuth(); return; }
    }
    await enterApp();
  } catch (error) {
    app.innerHTML = `<main class="auth-screen"><section class="auth-panel" style="grid-column:1/-1"><div class="auth-box"><div class="eyebrow">BACKLOG COMPASS / CONNECTION</div><h2>Can't start the app.</h2><p>${escapeHtml(error.message)}</p><p class="auth-footnote">Check that FastAPI is running, that <code>/api/v1/config</code> is reachable, and that Supabase public environment variables are configured.</p><button class="btn btn-primary" onclick="location.reload()">Try again</button></div></section></main>`;
  }
}

boot();