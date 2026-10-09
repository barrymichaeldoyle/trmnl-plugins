// TRMNL's default JavaScript transform runtime calls transform(input).
// A changing merge variable prevents unchanged static data from freezing images.
// TRMNL limits settings.yml and transform.js to about 100 KB each, so the
// exported recipe carries translations that do not fit in static data as
// SCRIPTURE. Local previews and tests pass the complete collection as input.
function transform(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const { trmnl, ...data } = input;
  const bundled = typeof SCRIPTURE === 'undefined' ? {} : SCRIPTURE;
  const content = { ...data, translations: { ...bundled.translations, ...data.translations } };
  const options = trmnl?.plugin_settings?.custom_fields_values || {};
  // The plugin refresh rate sets the passage interval: the longest whole-hour
  // division of the local day that fits, so slots still start at local midnight.
  const minutes = Number(trmnl?.plugin_settings?.refresh_interval_minutes) || 1440;
  const hours = [24, 12, 8, 6, 4, 3, 2, 1].find(hours => hours * 60 <= minutes) || 1;
  const seconds = hours * 3600;
  const offset = Number(trmnl?.user?.utc_offset) || 0;
  const language = ['en', 'fr', 'es'].includes(options.language) ? options.language : 'en';
  // A missing selected translation must show recovery, never English under
  // another language's preference or attribution.
  const collection = language === 'en' ? content : content.translations?.[language] || {};
  const themes = Array.isArray(collection.themes)
    ? collection.themes.filter(theme => theme && typeof theme.id === 'string' && theme.id.trim()) : [];
  // Multi-select arrives as an array. Accept CSV and the previous scalar setting
  // too, so existing installations and local preview links remain useful.
  const raw = Array.isArray(options.theme) ? options.theme : [options.theme];
  const legacy = { peace: 'rest', hope: 'hardship', strength: 'hardship', trust: 'faith', wisdom: 'decisions', love: 'relationships', prayer: 'faith' };
  const requested = raw.flatMap(value => typeof value === 'string' ? value.split(',') : [])
    .map(value => value.trim().toLowerCase()).map(value => legacy[value] || value);
  // Specific choices win even if "All themes" is still selected.
  const selected = themes.filter(theme => requested.includes(theme.id)).map(theme => theme.id);
  const accepted = selected.length ? selected : themes.map(theme => theme.id);
  const hasAttribution = collection.translation?.language === language
    && ['name', 'abbreviation', 'source'].every(key => typeof collection.translation[key] === 'string' && collection.translation[key].trim());
  const verses = hasAttribution && Array.isArray(collection.verses)
    ? collection.verses.filter(verse => verse && ['id', 'theme', 'reference', 'text', 'source']
      .every(key => typeof verse[key] === 'string' && verse[key].trim())) : [];
  // Return only the selected language's metadata and passages; the complete
  // multilingual collection would exceed TRMNL's merge-variable payload limit.
  const { verses: allVerses, translations, ...metadata } = content;
  const { verses: translatedVerses, ...translation } = language === 'en' ? {} : collection;
  return {
    ...metadata,
    ...(language !== 'en' ? { translations: { [language]: { ...translation, themes } } } : { themes }),
    reading_pool: verses.filter(verse => accepted.includes(verse.theme)),
    interval_seconds: seconds,
    rotation_slot: Math.floor((Date.now() / 1000 + offset) / seconds),
  };
}
