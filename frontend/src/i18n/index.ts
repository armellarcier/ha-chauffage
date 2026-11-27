import { en } from './en.ts';
import { fr } from './fr.ts';

// ---------- i18n ----------
// UI texts in English and French. The language follows the user's Home Assistant language
// (French for any "fr*" language, English otherwise) unless the card sets `language`.
// Schedule and preset names are data (set by the user): not translated here.
export const I18N = { en, fr };
