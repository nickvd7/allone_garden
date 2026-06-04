import { SEEDS } from '../components/ToolsPanel';
import { STRUCTURE_DEFS } from '../components/StructuresPanel';

/** Client-side Gradendex when API is unreachable. */
export function buildGradendexFallbackEntries() {
  const plants = SEEDS.map((s) => ({
    slug: s.id,
    name: s.id,
    emoji: s.emoji,
    category: 'plant',
    short_desc: '',
    long_desc: '',
    growth_days: null,
    base_coins: null,
    companion_good: [],
    companion_bad: [],
    tips: [],
  }));
  const structures = STRUCTURE_DEFS.map((d) => ({
    slug: d.id,
    name: d.name,
    emoji: d.emoji,
    category: 'structure',
    short_desc: d.description,
    long_desc: '',
    growth_days: null,
    base_coins: d.buildCost,
    companion_good: [],
    companion_bad: [],
    tips: [],
  }));
  return [...plants, ...structures];
}
