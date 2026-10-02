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
  const rotation = options.rotation;
  const seconds = { hourly: 3600, six_hours: 21600, twelve_hours: 43200 }[rotation] || 86400;
  const offset = Number(trmnl?.user?.utc_offset) || 0;
  const collection = content.translations?.[options.language] || content;
  const themes = Array.isArray(collection.themes) ? collection.themes : [];
  // Multi-select arrives as an array. Accept CSV and the previous scalar setting
  // too, so existing installations and local preview links remain useful.
  const raw = Array.isArray(options.theme) ? options.theme : [options.theme];
  const legacy = { peace: 'rest', hope: 'hardship', strength: 'hardship', trust: 'faith', wisdom: 'decisions', love: 'relationships', prayer: 'faith' };
  const requested = raw.flatMap(value => typeof value === 'string' ? value.split(',') : [])
    .map(value => value.trim().toLowerCase()).map(value => legacy[value] || value);
  // Specific choices win even if "All themes" is still selected.
  const selected = themes.filter(theme => requested.includes(theme.id)).map(theme => theme.id);
  const accepted = selected.length ? selected : themes.map(theme => theme.id);
  const verses = Array.isArray(collection.verses) ? collection.verses : [];
  // Return only the selected language's metadata and passages; the complete
  // multilingual collection would exceed TRMNL's merge-variable payload limit.
  const { verses: allVerses, translations, ...metadata } = content;
  const { verses: translatedVerses, ...translation } = content.translations?.[options.language] || {};
  return {
    ...metadata,
    ...(content.translations?.[options.language] ? { translations: { [options.language]: translation } } : {}),
    reading_pool: verses.filter(verse => accepted.includes(verse.theme)),
    rotation_slot: Math.floor((Date.now() / 1000 + offset) / seconds),
  };
}
