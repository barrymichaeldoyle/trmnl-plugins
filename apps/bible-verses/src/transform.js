// TRMNL's default JavaScript transform runtime calls transform(input).
// TRMNL polls one translation's collection, chosen in the polling URL from the
// translation setting. A changing merge variable keeps unchanged data from
// freezing images.
var TRANSLATIONS = {
  web: 'en', bsb: 'en', kjv: 'en', luther1912: 'de', rv1909: 'es', ntbt: 'es',
  lsg1910: 'fr', riveduta1927: 'it', hs1917: 'nl', blivre: 'pt',
};
// Values saved before the translation setting replaced the language setting.
var ALIASES = { en: 'web', es: 'rv1909', fr: 'lsg1910' };
// Shown in the selected language when the collection is missing or damaged.
// Smaller views show only the second line, so it stands on its own.
var RECOVERY = {
  en: ['Today’s passage couldn’t load', 'Daily Bread couldn’t load today’s passage and will try again at the next refresh.'],
  de: ['Der heutige Abschnitt konnte nicht geladen werden', 'Daily Bread konnte den heutigen Abschnitt nicht laden und versucht es bei der nächsten Aktualisierung erneut.'],
  es: ['No se pudo cargar el pasaje de hoy', 'Daily Bread no pudo cargar el pasaje de hoy y lo intentará de nuevo en la próxima actualización.'],
  fr: ['Le passage du jour n’a pas pu être chargé', 'Daily Bread n’a pas pu charger le passage du jour et réessaiera à la prochaine actualisation.'],
  it: ['Impossibile caricare il passo di oggi', 'Daily Bread non è riuscito a caricare il passo di oggi e riproverà al prossimo aggiornamento.'],
  nl: ['Het gedeelte van vandaag kon niet worden geladen', 'Daily Bread kon het gedeelte van vandaag niet laden en probeert het opnieuw bij de volgende verversing.'],
  pt: ['Não foi possível carregar a passagem de hoje', 'O Daily Bread não conseguiu carregar a passagem de hoje e tentará novamente na próxima atualização.'],
};

function transform(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const { trmnl, ...collection } = input;
  const options = trmnl?.plugin_settings?.custom_fields_values || {};
  // The plugin refresh rate sets the passage interval: the longest whole-hour
  // division of the local day that fits, so slots still start at local midnight.
  const minutes = Number(trmnl?.plugin_settings?.refresh_interval_minutes) || 1440;
  const hours = [24, 12, 8, 6, 4, 3, 2, 1].find(hours => hours * 60 <= minutes) || 1;
  const seconds = hours * 3600;
  const offset = Number(trmnl?.user?.utc_offset) || 0;
  // The polling URL resolves the setting the same way, unknown values to WEB.
  const requested = ALIASES[options.language] || options.language;
  const id = Object.prototype.hasOwnProperty.call(TRANSLATIONS, requested) ? requested : 'web';
  const language = TRANSLATIONS[id];
  // A collection for any other translation must show recovery, never another
  // translation under this one's preference or attribution.
  const translation = collection.translation;
  const hasAttribution = Boolean(translation) && translation.id === id && translation.language === language
    && ['name', 'abbreviation', 'source'].every(key => typeof translation[key] === 'string' && translation[key].trim());
  const themes = hasAttribution && Array.isArray(collection.themes)
    ? collection.themes.filter(theme => theme && typeof theme.id === 'string' && theme.id.trim()) : [];
  // Multi-select arrives as an array. Accept CSV and the previous scalar setting
  // too, so existing installations and local preview links remain useful.
  const raw = Array.isArray(options.theme) ? options.theme : [options.theme];
  const legacy = { peace: 'rest', hope: 'hardship', strength: 'hardship', trust: 'faith', wisdom: 'decisions', love: 'relationships', prayer: 'faith' };
  const chosen = raw.flatMap(value => typeof value === 'string' ? value.split(',') : [])
    .map(value => value.trim().toLowerCase()).map(value => legacy[value] || value);
  // Specific choices win even if "All themes" is still selected.
  const selected = themes.filter(theme => chosen.includes(theme.id)).map(theme => theme.id);
  const accepted = selected.length ? selected : themes.map(theme => theme.id);
  const verses = hasAttribution && Array.isArray(collection.verses)
    ? collection.verses.filter(verse => verse && ['id', 'theme', 'reference', 'text', 'source']
      .every(key => typeof verse[key] === 'string' && verse[key].trim())) : [];
  const labels = hasAttribution && collection.labels && typeof collection.labels === 'object' ? collection.labels : {};
  // Return only what the views use: the merge variables stay small, and stale
  // values from an earlier render cannot leak into a recovery screen.
  return {
    language,
    translation: hasAttribution ? translation : null,
    themes,
    labels: { ...labels, missing_title: RECOVERY[language][0], missing_text: RECOVERY[language][1] },
    reading_pool: verses.filter(verse => accepted.includes(verse.theme)),
    interval_seconds: seconds,
    rotation_slot: Math.floor((Date.now() / 1000 + offset) / seconds),
  };
}
