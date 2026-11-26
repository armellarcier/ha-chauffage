import { html } from 'lit';

// Reloads the page to finish an update. Home Assistant's service worker serves the page from its
// cache, then updates it: its caches are emptied first, or the first reload gets the former page
// again (the companion app has no hard reload).
export async function reloadPage(win = window) {
  try {
    if (win.caches) await Promise.all((await win.caches.keys()).map((key) => win.caches.delete(key)));
  } catch (e) { /* reloaded all the same */ }
  win.location.reload();
}

// What a card or the panel shows instead of its content while the integration's data can't be
// used: a text, with a Reload button when reloading the page finishes an update, or "…" while
// the data is on its way. null once the data is ready.
export const NOTICE_RELOAD = { text: 'reloadNeeded', reload: true };
export function sourceNotice(src) {
  if (src.stale) return NOTICE_RELOAD;
  if (!src.available) return { text: 'integrationMissing' };
  if (src.outdated) return { text: 'restartNeeded' };
  if (!src.ready) return { loading: true };
  return null;
}

// The notice. Its Reload button carries data-act="reload-page": the card or the panel reloads the
// page on its click
export function noticeTemplate(notice, t) {
  if (notice.loading) return html`<div class="loading">…</div>`;
  const button = notice.reload
    ? html`<div><button class="btn primary" data-act="reload-page">${t('reloadPage')}</button></div>` : '';
  return html`<div class="missing" role="status">${t(notice.text)}${button}</div>`;
}