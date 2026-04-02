/**
 * Rebuilds gradendex.{fr,es,pt}.json from gradendex.en.json with full UI + entry translations.
 * Run from repo root: node packages/frontend/scripts/gradendex-localize-fr-es-pt.js
 *
 * Entries are read from `gradendex-entries-overrides/{fr,es,pt}.json` (same source as `gradendex:extra`).
 * To update entries only: edit those overrides and run `npm run gradendex:extra`.
 */
const fs = require('fs');
const path = require('path');

const i18nDir = path.join(__dirname, '../src/i18n');
const enPath = path.join(i18nDir, 'gradendex.en.json');
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

const uiPage = {
  fr: {
    ui: {
      loading: 'Chargement du Gradendex…',
      error_load: 'Impossible de charger le Gradendex. Le serveur est-il démarré ?',
      search_placeholder: '🔍 Rechercher plantes ou bâtiments…',
      no_results: 'Aucune entrée pour « {{search}} ».',
      tab_all: '🌍 Tout',
      tab_plants: '🌱 Plantes',
      tab_structures: '🏗️ Bâtiments',
      back_to_list: '← Retour à la liste',
      back: '← Retour',
      edit: '✏️ Modifier',
      edit_title_suffix: '— Modifier',
      companion_planting: 'Cultures associées',
      tips: 'Astuces',
      last_edited: 'Dernière modification par {{user}} · {{date}}',
      admin_hint: '✏️ Mode admin — cliquez une entrée pour modifier',
      stats_days: '{{count}} jour',
      stats_days_plural: '{{count}} jours',
      stats_coins: '{{count}} pièces',
      aria_search: 'Rechercher dans le Gradendex',
      aria_view: 'Voir {{name}}',
      saving: 'Enregistrement…',
      save_changes: '💾 Enregistrer',
      cancel: 'Annuler',
      load_error_detail: 'Impossible d’enregistrer',
      form_emoji: 'Emoji',
      form_name: 'Nom',
      form_category: 'Catégorie',
      form_short: 'Description courte (max 300 car.)',
      form_long: 'Description longue (Markdown : **gras**, *italique*, sauts de ligne)',
      form_growth: 'Jours de croissance',
      form_coins: 'Pièces de base 🪙',
      form_tips: 'Astuces (une par ligne)',
      cat_plant: 'Plante',
      cat_structure: 'Bâtiment',
      cat_tool: 'Outil',
      cat_other: 'Autre',
    },
    page: {
      title: '📖 Gradendex',
      subtitle: '— référence cultures et bâtiments',
      brand: '🌱 AllOne Garden',
      back_game: '🎮 Retour au jeu',
      intro: 'Référence tenue par la communauté pour chaque culture et bâtiment dans AllOne Garden.',
      intro_logged_in: 'Vous êtes connecté — les admins peuvent modifier les entrées.',
      intro_guest_before: '',
      log_in: 'Connexion',
      intro_guest_after: 'pour contribuer en tant qu’admin.',
      footer: 'AllOne Garden · Gradendex · Données chargées depuis',
      open_full: '↗ Page entière',
      open_full_title: 'Ouvrir le Gradendex en pleine page',
      close: 'Fermer le Gradendex',
      aria_dialog: 'Gradendex',
    },
  },
  es: {
    ui: {
      loading: 'Cargando Gradendex…',
      error_load: 'No se pudo cargar Gradendex. ¿Está el servidor en marcha?',
      search_placeholder: '🔍 Buscar plantas o edificios…',
      no_results: 'No hay entradas para «{{search}}».',
      tab_all: '🌍 Todo',
      tab_plants: '🌱 Plantas',
      tab_structures: '🏗️ Edificios',
      back_to_list: '← Volver a la lista',
      back: '← Volver',
      edit: '✏️ Editar',
      edit_title_suffix: '— Editar',
      companion_planting: 'Cultivos asociados',
      tips: 'Consejos',
      last_edited: 'Última edición por {{user}} · {{date}}',
      admin_hint: '✏️ Modo admin — haz clic en una entrada para editar',
      stats_days: '{{count}} día',
      stats_days_plural: '{{count}} días',
      stats_coins: '{{count}} monedas',
      aria_search: 'Buscar en Gradendex',
      aria_view: 'Ver {{name}}',
      saving: 'Guardando…',
      save_changes: '💾 Guardar cambios',
      cancel: 'Cancelar',
      load_error_detail: 'No se pudieron guardar los cambios',
      form_emoji: 'Emoji',
      form_name: 'Nombre',
      form_category: 'Categoría',
      form_short: 'Descripción breve (máx. 300 caracteres)',
      form_long: 'Descripción larga (Markdown: **negrita**, *cursiva*, saltos de línea)',
      form_growth: 'Días de crecimiento',
      form_coins: 'Monedas base 🪙',
      form_tips: 'Consejos (uno por línea)',
      cat_plant: 'Planta',
      cat_structure: 'Edificio',
      cat_tool: 'Herramienta',
      cat_other: 'Otro',
    },
    page: {
      title: '📖 Gradendex',
      subtitle: '— referencia de cultivos y edificios',
      brand: '🌱 AllOne Garden',
      back_game: '🎮 Volver al juego',
      intro: 'Referencia mantenida por la comunidad para cada cultivo y edificio en AllOne Garden.',
      intro_logged_in: 'Has iniciado sesión — los admins pueden editar entradas.',
      intro_guest_before: '',
      log_in: 'Iniciar sesión',
      intro_guest_after: 'para contribuir como admin.',
      footer: 'AllOne Garden · Gradendex · Datos cargados desde',
      open_full: '↗ Página completa',
      open_full_title: 'Abrir Gradendex a página completa',
      close: 'Cerrar Gradendex',
      aria_dialog: 'Gradendex',
    },
  },
  pt: {
    ui: {
      loading: 'A carregar Gradendex…',
      error_load: 'Não foi possível carregar o Gradendex. O servidor está a correr?',
      search_placeholder: '🔍 Pesquisar plantas ou edifícios…',
      no_results: 'Sem entradas para «{{search}}».',
      tab_all: '🌍 Tudo',
      tab_plants: '🌱 Plantas',
      tab_structures: '🏗️ Edifícios',
      back_to_list: '← Voltar à lista',
      back: '← Voltar',
      edit: '✏️ Editar',
      edit_title_suffix: '— Editar',
      companion_planting: 'Culturas associadas',
      tips: 'Dicas',
      last_edited: 'Última edição por {{user}} · {{date}}',
      admin_hint: '✏️ Modo admin — clique numa entrada para editar',
      stats_days: '{{count}} dia',
      stats_days_plural: '{{count}} dias',
      stats_coins: '{{count}} moedas',
      aria_search: 'Pesquisar no Gradendex',
      aria_view: 'Ver {{name}}',
      saving: 'A guardar…',
      save_changes: '💾 Guardar alterações',
      cancel: 'Cancelar',
      load_error_detail: 'Não foi possível guardar',
      form_emoji: 'Emoji',
      form_name: 'Nome',
      form_category: 'Categoria',
      form_short: 'Descrição curta (máx. 300 caracteres)',
      form_long: 'Descrição longa (Markdown: **negrito**, *itálico*, quebras de linha)',
      form_growth: 'Dias de crescimento',
      form_coins: 'Moedas base 🪙',
      form_tips: 'Dicas (uma por linha)',
      cat_plant: 'Planta',
      cat_structure: 'Edifício',
      cat_tool: 'Ferramenta',
      cat_other: 'Outro',
    },
    page: {
      title: '📖 Gradendex',
      subtitle: '— referência de cultivos e edifícios',
      brand: '🌱 AllOne Garden',
      back_game: '🎮 Voltar ao jogo',
      intro: 'Referência mantida pela comunidade para cada cultivo e edifício em AllOne Garden.',
      intro_logged_in: 'Está ligado — os admins podem editar entradas.',
      intro_guest_before: '',
      log_in: 'Iniciar sessão',
      intro_guest_after: 'para contribuir como admin.',
      footer: 'AllOne Garden · Gradendex · Dados carregados de',
      open_full: '↗ Página completa',
      open_full_title: 'Abrir Gradendex em página completa',
      close: 'Fechar Gradendex',
      aria_dialog: 'Gradendex',
    },
  },
};

const overrideDir = path.join(__dirname, 'gradendex-entries-overrides');

function loadEntryOverrides(lang) {
  const fp = path.join(overrideDir, `${lang}.json`);
  if (!fs.existsSync(fp)) {
    throw new Error(`Missing gradendex entry override: ${fp}`);
  }
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

for (const lang of ['fr', 'es', 'pt']) {
  const out = JSON.parse(JSON.stringify(en));
  out.gradendex.ui = { ...out.gradendex.ui, ...uiPage[lang].ui };
  out.gradendex.page = { ...out.gradendex.page, ...uiPage[lang].page };
  out.gradendex.entries = loadEntryOverrides(lang);
  fs.writeFileSync(
    path.join(i18nDir, `gradendex.${lang}.json`),
    JSON.stringify(out, null, 2) + '\n'
  );
  console.log('Wrote gradendex.' + lang + '.json');
}
