// Loads the card on a page that Home Assistant served while it started, before Chauffage was set
// up (issue #59): such a page does not load the card. The integration saves this file as a
// dashboard resource, in a data: URL, because its own URLs only answer once it is set up.
// CARD_URL is replaced by the URL of the card. Comment lines are removed from the resource.
(async () => {
  const url = new URL('CARD_URL', location.origin).href;
  // A slow start can last minutes: try again and again, less and less often
  for (let delay = 1000; !customElements.get('chauffage-programme-card'); delay = Math.min(delay * 1.5, 30000)) {
    try {
      // A failed import is never retried by the browser: import only once the card is served
      if ((await fetch(url, { method: 'HEAD', cache: 'no-store' })).ok) {
        await import(url);
        return;
      }
    } catch (err) {
      // Home Assistant is restarting
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
})();
