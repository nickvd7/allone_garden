import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import nl from './locales/nl.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';
import it from './locales/it.json';
import pl from './locales/pl.json';
import tr from './locales/tr.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import zh from './locales/zh.json';
import ar from './locales/ar.json';
import hi from './locales/hi.json';
import id from './locales/id.json';
import vi from './locales/vi.json';
import uk from './locales/uk.json';
import gradendexEn from './gradendex.en.json';
import gradendexNl from './gradendex.nl.json';
import gradendexDe from './gradendex.de.json';
import gradendexFr from './gradendex.fr.json';
import gradendexEs from './gradendex.es.json';
import gradendexPt from './gradendex.pt.json';
import gradendexRu from './gradendex.ru.json';
import gradendexIt from './gradendex.it.json';
import gradendexPl from './gradendex.pl.json';
import gradendexTr from './gradendex.tr.json';
import gradendexJa from './gradendex.ja.json';
import gradendexKo from './gradendex.ko.json';
import gradendexZh from './gradendex.zh.json';
import gradendexAr from './gradendex.ar.json';
import gradendexHi from './gradendex.hi.json';
import gradendexId from './gradendex.id.json';
import gradendexVi from './gradendex.vi.json';
import gradendexUk from './gradendex.uk.json';

const withGdex = (base, gdex) => ({ ...base, ...gdex });

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: withGdex(en, gradendexEn) },
      nl: { translation: withGdex(nl, gradendexNl) },
      de: { translation: withGdex(de, gradendexDe) },
      fr: { translation: withGdex(fr, gradendexFr) },
      es: { translation: withGdex(es, gradendexEs) },
      pt: { translation: withGdex(pt, gradendexPt) },
      ru: { translation: withGdex(ru, gradendexRu) },
      it: { translation: withGdex(it, gradendexIt) },
      pl: { translation: withGdex(pl, gradendexPl) },
      tr: { translation: withGdex(tr, gradendexTr) },
      ja: { translation: withGdex(ja, gradendexJa) },
      ko: { translation: withGdex(ko, gradendexKo) },
      zh: { translation: withGdex(zh, gradendexZh) },
      ar: { translation: withGdex(ar, gradendexAr) },
      hi: { translation: withGdex(hi, gradendexHi) },
      id: { translation: withGdex(id, gradendexId) },
      vi: { translation: withGdex(vi, gradendexVi) },
      uk: { translation: withGdex(uk, gradendexUk) },
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;