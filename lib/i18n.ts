export type Locale = "en" | "fr" | "ja";

export const LOCALES: Locale[] = ["en", "fr", "ja"];
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "EN",
  fr: "FR",
  ja: "日本語",
};

type Dict = Record<string, string>;

const en: Dict = {
  tagline: "Atlas of Art History",
  explore: "Explore",
  movements: "Movements",
  artists: "Artists",
  searchMovements: "Search movements…",
  searchArtists: "Search artists…",
  noMatches: "No matches",
  enterMuseum: "Enter the museum",
  chooseMuseum: "Choose a museum",
  enter: "Enter",
  works: "{n} works",
  biographyUnavailable: "Biography unavailable.",
  galleryUnavailable:
    "Gallery unavailable — this artist’s work is still in copyright, so no public-domain images exist on Commons.",
  dateUnknown: "Date unknown",
  backConstellation: "Back to the constellation",
  scrollHint: "Scroll to zoom · drag to pan · click a movement",
  scrollHintTouch: "Pinch to zoom · drag to pan · tap a star",
  museumHint: "Drag to look · WASD to walk · click a painting",
  museumHintTouch: "Drag to look · joystick to walk · tap a painting",
  noWorksBody:
    "No public-domain works for {name} are on Wikimedia Commons yet, so there’s no gallery to walk. Their biography still lives on the timeline.",
  wikipedia: "Wikipedia",
  keyDates: "Key dates",
  born: "Born",
  died: "Died",
  fullscreen: "Full screen",
  exitFullscreen: "Exit full screen",
  maxDefinition: "Max definition",
  zoomPan: "Scroll to zoom · drag to pan",
  fit: "Fit",
  share: "Share",
  linkCopied: "Link copied",
  listen: "Listen",
  influencedBy: "Influenced by",
  influenceOn: "Influence on",
  doorwayHint: "Walk to the far wall — doorways lead to kindred galleries",
  tour: "Guided tour",
  tourNext: "Next",
  tourEnd: "End tour",
  tourStops: "Jump to a work",
};

const fr: Dict = {
  tagline: "Atlas de l’histoire de l’art",
  explore: "Explorer",
  movements: "Mouvements",
  artists: "Artistes",
  searchMovements: "Rechercher un mouvement…",
  searchArtists: "Rechercher un artiste…",
  noMatches: "Aucun résultat",
  enterMuseum: "Entrer dans le musée",
  chooseMuseum: "Choisir un musée",
  enter: "Entrer",
  works: "{n} œuvres",
  biographyUnavailable: "Biographie indisponible.",
  galleryUnavailable:
    "Galerie indisponible — l’œuvre de cet artiste est encore sous droits d’auteur ; aucune image du domaine public n’existe sur Commons.",
  dateUnknown: "Date inconnue",
  backConstellation: "Retour à la constellation",
  scrollHint: "Molette pour zoomer · glisser pour déplacer · cliquer un mouvement",
  scrollHintTouch: "Pincer pour zoomer · glisser pour déplacer · toucher une étoile",
  museumHint: "Glisser pour regarder · WASD pour marcher · cliquer un tableau",
  museumHintTouch: "Glisser pour regarder · joystick pour marcher · toucher un tableau",
  noWorksBody:
    "Aucune œuvre de {name} dans le domaine public n’est encore sur Wikimedia Commons ; il n’y a donc pas de galerie à parcourir. Sa biographie demeure sur la frise.",
  wikipedia: "Wikipédia",
  keyDates: "Repères",
  born: "Naissance",
  died: "Décès",
  fullscreen: "Plein écran",
  exitFullscreen: "Quitter le plein écran",
  maxDefinition: "Définition max",
  zoomPan: "Molette pour zoomer · glisser pour déplacer",
  fit: "Ajuster",
  share: "Partager",
  linkCopied: "Lien copié",
  listen: "Écouter",
  influencedBy: "Influencé par",
  influenceOn: "Influence sur",
  doorwayHint: "Marchez vers le fond — les portes mènent aux galeries parentes",
  tour: "Visite guidée",
  tourNext: "Suivant",
  tourEnd: "Terminer",
  tourStops: "Aller à une œuvre",
};

const ja: Dict = {
  tagline: "美術史の星図",
  explore: "探索",
  movements: "様式",
  artists: "画家",
  searchMovements: "様式を検索…",
  searchArtists: "画家を検索…",
  noMatches: "該当なし",
  enterMuseum: "美術館に入る",
  chooseMuseum: "美術館を選ぶ",
  enter: "入る",
  works: "{n}点の作品",
  biographyUnavailable: "略歴はありません。",
  galleryUnavailable:
    "ギャラリーは利用できません — この画家の作品はまだ著作権が有効で、コモンズにパブリックドメイン画像がありません。",
  dateUnknown: "制作年不明",
  backConstellation: "星座に戻る",
  scrollHint: "スクロールでズーム · ドラッグで移動 · 様式をクリック",
  scrollHintTouch: "ピンチで拡大 · ドラッグで移動 · 星をタップ",
  museumHint: "ドラッグで視点 · WASDで移動 · 絵画をクリック",
  museumHintTouch: "ドラッグで視点 · スティックで移動 · 絵画をタップ",
  noWorksBody:
    "{name}のパブリックドメイン作品はまだウィキメディア・コモンズにないため、巡れるギャラリーはありません。略歴はタイムラインでご覧いただけます。",
  wikipedia: "ウィキペディア",
  keyDates: "略年譜",
  born: "生誕",
  died: "死去",
  fullscreen: "全画面",
  exitFullscreen: "全画面を終了",
  maxDefinition: "最高精細",
  zoomPan: "スクロールで拡大 · ドラッグで移動",
  fit: "全体",
  share: "共有",
  linkCopied: "リンクをコピーしました",
  listen: "聴く",
  influencedBy: "影響を受けた",
  influenceOn: "影響を与えた",
  doorwayHint: "奥の壁へ進むと、つながる画家のギャラリーへの扉があります",
  tour: "ガイドツアー",
  tourNext: "次へ",
  tourEnd: "終了",
  tourStops: "作品へ移動",
};

export const DICT: Record<Locale, Dict> = { en, fr, ja };

export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  let s = DICT[locale]?.[key] ?? DICT.en[key] ?? key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      s = s.replace(`{${k}}`, String(vars[k]));
    }
  }
  return s;
}

/** Movement names are a fixed curated set, so they live here (not the DB). */
export const PERIOD_NAMES: Record<string, { fr: string; ja: string }> = {
  "Medieval & Gothic": { fr: "Médiéval et gothique", ja: "中世・ゴシック" },
  "Early Renaissance": { fr: "Première Renaissance", ja: "初期ルネサンス" },
  "High Renaissance": { fr: "Haute Renaissance", ja: "盛期ルネサンス" },
  "Northern Renaissance": { fr: "Renaissance nordique", ja: "北方ルネサンス" },
  Baroque: { fr: "Baroque", ja: "バロック" },
  Rococo: { fr: "Rococo", ja: "ロココ" },
  Neoclassicism: { fr: "Néoclassicisme", ja: "新古典主義" },
  Romanticism: { fr: "Romantisme", ja: "ロマン主義" },
  Realism: { fr: "Réalisme", ja: "写実主義" },
  Impressionism: { fr: "Impressionnisme", ja: "印象派" },
  "Post-Impressionism": { fr: "Post-impressionnisme", ja: "ポスト印象派" },
  Expressionism: { fr: "Expressionnisme", ja: "表現主義" },
  Cubism: { fr: "Cubisme", ja: "キュビスム" },
  Surrealism: { fr: "Surréalisme", ja: "シュルレアリスム" },
  "Abstract Expressionism": {
    fr: "Expressionnisme abstrait",
    ja: "抽象表現主義",
  },
  "Pop Art": { fr: "Pop art", ja: "ポップ・アート" },
  Contemporary: { fr: "Contemporain", ja: "現代美術" },
};

export function periodName(locale: Locale, enName: string): string {
  if (locale === "en") return enName;
  return PERIOD_NAMES[enName]?.[locale] ?? enName;
}

/** Pick a localized field from a DB i18n blob, falling back to the base value. */
export function localized(
  locale: Locale,
  i18n: unknown,
  field: string,
  fallback: string | null,
): string | null {
  if (locale !== "en" && i18n && typeof i18n === "object") {
    const v = (i18n as Record<string, Record<string, unknown>>)[locale]?.[field];
    if (typeof v === "string" && v.trim()) return v;
  }
  return fallback;
}
