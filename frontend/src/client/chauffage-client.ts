// The subscription to the integration's data: one per page, shared by every card, more-info
// block and panel. `client` is the page's; a test starts a new one with `resetClient()`.

// The subscription tried again: first after 5 s, then twice as long each time, up to a minute
const SUBSCRIBE_RETRY_MS = 5000;
const SUBSCRIBE_RETRY_MAX_MS = 60000;
const SUBSCRIBE_NO_DATA_MS = 10000;

export type Listener = () => void;

export class ChauffageClient {
  // The latest data pushed by the integration, as `chauffage/subscribe` sends it
  data: any = null;
  // true: Home Assistant has the integration's services but no loaded entry (deleted or disabled;
  // its services stay until a restart)
  missing = false;
  listeners = new Set<Listener>();
  private connection: any = null;
  private hass: any = null; // the latest, for the panels of a "not_loaded"
  private missingPanels: any = null;
  private watched: any = null;
  private attempt = 0; // the subscription of the moment: the answers of a former one are ignored
  private subscribed: Promise<any> | null = null; // its unsubscribe function, once Home Assistant has answered
  private retryIn = SUBSCRIBE_RETRY_MS;
  private timer: ReturnType<typeof setTimeout> | null = null;

  connect(hass) {
    this.hass = hass;
    // Set up again (its panel is back): subscribed again, with no page reload
    if (this.missing && hass.panels && hass.panels.chauffage && hass.panels !== this.missingPanels) this.connection = null;
    if (!hass.connection || this.connection === hass.connection) return;
    this.subscribe(hass.connection);
  }

  // Called back on every push of the integration, and when it goes missing. Returns the function
  // that stops listening.
  listen(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size && this.timer) {
        // No more tries: the next card subscribes again
        this.stopTimer();
        this.connection = null;
      }
    };
  }

  // Stops the tries for good: the page's client is replaced (tests)
  dispose() {
    this.stopTimer();
    this.listeners.clear();
    this.attempt += 1;
  }

  private subscribe(connection) {
    this.connection = connection;
    this.watchReconnections(connection);
    this.stopTimer();
    if (this.subscribed) this.subscribed.then((unsubscribe) => unsubscribe && unsubscribe()).catch(() => {});
    const attempt = ++this.attempt;
    let received = false;
    // Not replayed by Home Assistant's library after a reconnection: it tries once, often before
    // Chauffage is set up, and never again. The card subscribes again itself (watchReconnections).
    const subscribed = connection.subscribeMessage((data) => {
      if (attempt !== this.attempt) return;
      received = true;
      this.stopTimer();
      this.retryIn = SUBSCRIBE_RETRY_MS;
      this.missing = false;
      this.data = data;
      this.notify();
    }, { type: 'chauffage/subscribe' }, { resubscribe: false });
    this.subscribed = subscribed.catch(() => null);
    subscribed.then(() => {
      // The integration sends its data at once: a subscription that brings nothing is made again
      if (attempt === this.attempt && !received) this.retry(SUBSCRIBE_NO_DATA_MS);
    }, (e) => {
      if (attempt !== this.attempt) return;
      const code = e && e.code;
      if (code === 'not_loaded') {
        this.missing = true;
        this.missingPanels = this.hass && this.hass.panels; // a new set holding Chauffage's panel means it is back
        this.notify();
      }
      // Not set up yet (Home Assistant is starting), or deleted: tried again, less and less often
      if (code === 'not_loaded' || code === 'unknown_command') {
        this.retry(this.retryIn);
        this.retryIn = Math.min(this.retryIn * 2, SUBSCRIBE_RETRY_MAX_MS);
        return;
      }
      console.error('ha-chauffage: cannot subscribe to the integration', e);
      this.connection = null;
    });
  }

  // Subscribes again later, while a card, a block or the panel is on the page
  private retry(ms: number) {
    this.stopTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.listeners.size && this.connection) this.subscribe(this.connection);
    }, ms);
  }

  private stopTimer() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  // Home Assistant restarted, or the page woke up: the connection is ready again
  private watchReconnections(connection) {
    if (this.watched === connection || !connection.addEventListener) return;
    this.watched = connection;
    connection.addEventListener('ready', () => {
      if (this.connection !== connection) return;
      // The server dropped the former subscription with the former socket. Its id now belongs to
      // another message of the new socket: unsubscribing it would close someone else's.
      this.subscribed = null;
      this.retryIn = SUBSCRIBE_RETRY_MS;
      this.subscribe(connection);
    });
  }

  private notify() {
    for (const listener of [...this.listeners]) listener();
  }
}

// The page's client
export let client = new ChauffageClient();

// A new client for the page: the former one stops its tries (tests)
export function resetClient(next = new ChauffageClient()) {
  client.dispose();
  client = next;
  return client;
}
