/**
 * Map API Gradendex entries to localized strings (falls back to API text).
 */
export function localizeGradendexEntry(entry, t) {
  if (!entry) return entry;
  const slug = entry.slug;
  const base = `gradendex.entries.${slug}`;
  const tips = entry.tips || [];
  const tipsOut = tips.map((tip, i) =>
    t(`${base}.tips.${i}`, { defaultValue: tip })
  );
  return {
    ...entry,
    name: t(`${base}.name`, { defaultValue: entry.name }),
    short_desc: t(`${base}.short_desc`, { defaultValue: entry.short_desc }),
    long_desc: t(`${base}.long_desc`, { defaultValue: entry.long_desc || '' }),
    tips: tipsOut,
  };
}

export function categoryLabel(category, t) {
  const map = {
    plant: 'gradendex.ui.cat_plant',
    structure: 'gradendex.ui.cat_structure',
    tool: 'gradendex.ui.cat_tool',
    other: 'gradendex.ui.cat_other',
  };
  const key = map[category];
  if (!key) return category;
  return t(key, { defaultValue: category });
}

export function companionDisplayName(slug, t) {
  return t(`gradendex.entries.${slug}.name`, { defaultValue: slug });
}
