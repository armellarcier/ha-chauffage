import manifest from '../../custom_components/chauffage/manifest.json' with { type: 'json' };

// The release version: the integration's, from its manifest. The bundle carries it.
export const VERSION: string = manifest.version;
