// What the card and Home Assistant's frontend put on `window`
interface Window {
  customCards: any[];
  customIcons: Record<string, any>;
  loadCardHelpers?: () => Promise<any>;
  __chauffageMoreInfoListener: boolean;
  __chauffageMoreInfoTimer: ReturnType<typeof setInterval>;
}
