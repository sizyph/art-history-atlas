/**
 * Curated scope for the whole atlas — the single source of truth shared by the
 * Next.js app (constellation layout) and the ingestion script.
 *
 * Painting selection is NOT hand-listed: ingestion pulls each artist's notable
 * works live from Wikidata/Commons, so nothing is invented.
 *
 * The first 12 periods have deep public-domain coverage (8+ paintings/artist).
 * `lite` periods (Cubism → Contemporary) are shown for the full sweep of the
 * timeline, but their artists are still in copyright, so Commons can host only
 * a few — or no — paintings. They appear as constellation clusters with rich
 * Wikipedia bios/blurbs and whatever public-domain works exist.
 */

export type CuratedPeriod = {
  slug: string;
  name: string;
  startYear: number;
  endYear: number;
  /** Cluster accent colour in the constellation. */
  color: string;
  /** English Wikipedia article title used to fetch the period blurb. */
  wikipediaTitle: string;
  /** Anchor artists, by English Wikipedia title. */
  artists: string[];
  /** Copyright-era movement shown for completeness; sparse galleries expected. */
  lite?: boolean;
};

export const PERIODS: CuratedPeriod[] = [
  {
    slug: "medieval-gothic",
    name: "Medieval & Gothic",
    startYear: 1200,
    endYear: 1400,
    color: "#C9A24B",
    wikipediaTitle: "Gothic art",
    artists: ["Giotto", "Duccio", "Simone Martini"],
  },
  {
    slug: "early-renaissance",
    name: "Early Renaissance",
    startYear: 1400,
    endYear: 1495,
    color: "#B5894A",
    wikipediaTitle: "Italian Renaissance painting",
    artists: [
      "Masaccio",
      "Sandro Botticelli",
      "Fra Angelico",
      "Piero della Francesca",
    ],
  },
  {
    slug: "high-renaissance",
    name: "High Renaissance",
    startYear: 1495,
    endYear: 1530,
    color: "#C46A52",
    wikipediaTitle: "High Renaissance",
    artists: ["Leonardo da Vinci", "Michelangelo", "Raphael", "Titian"],
  },
  {
    slug: "northern-renaissance",
    name: "Northern Renaissance",
    startYear: 1430,
    endYear: 1580,
    color: "#8A6E4B",
    wikipediaTitle: "Northern Renaissance",
    artists: [
      "Jan van Eyck",
      "Albrecht Dürer",
      "Pieter Bruegel the Elder",
      "Hieronymus Bosch",
    ],
  },
  {
    slug: "baroque",
    name: "Baroque",
    startYear: 1600,
    endYear: 1730,
    color: "#A6452F",
    wikipediaTitle: "Baroque painting",
    artists: [
      "Caravaggio",
      "Rembrandt",
      "Peter Paul Rubens",
      "Diego Velázquez",
      "Johannes Vermeer",
      "Artemisia Gentileschi",
    ],
  },
  {
    slug: "rococo",
    name: "Rococo",
    startYear: 1700,
    endYear: 1780,
    color: "#D98FA8",
    wikipediaTitle: "Rococo",
    artists: [
      "Jean-Antoine Watteau",
      "François Boucher",
      "Jean-Honoré Fragonard",
      "Canaletto",
    ],
  },
  {
    slug: "neoclassicism",
    name: "Neoclassicism",
    startYear: 1760,
    endYear: 1830,
    color: "#8FA1B3",
    wikipediaTitle: "Neoclassicism",
    artists: [
      "Jacques-Louis David",
      "Jean-Auguste-Dominique Ingres",
      "Angelica Kauffman",
    ],
  },
  {
    slug: "romanticism",
    name: "Romanticism",
    startYear: 1800,
    endYear: 1850,
    color: "#6E7FB0",
    wikipediaTitle: "Romanticism",
    artists: [
      "Francisco Goya",
      "Eugène Delacroix",
      "J. M. W. Turner",
      "Caspar David Friedrich",
      "Théodore Géricault",
    ],
  },
  {
    slug: "realism",
    name: "Realism",
    startYear: 1840,
    endYear: 1880,
    color: "#6E7B5E",
    wikipediaTitle: "Realism (art movement)",
    artists: [
      "Gustave Courbet",
      "Jean-François Millet",
      "Ilya Repin",
      "Rosa Bonheur",
    ],
  },
  {
    slug: "impressionism",
    name: "Impressionism",
    startYear: 1860,
    endYear: 1890,
    color: "#5FA6A0",
    wikipediaTitle: "Impressionism",
    artists: [
      "Claude Monet",
      "Pierre-Auguste Renoir",
      "Edgar Degas",
      "Camille Pissarro",
      "Berthe Morisot",
    ],
  },
  {
    slug: "post-impressionism",
    name: "Post-Impressionism",
    startYear: 1885,
    endYear: 1910,
    color: "#E0A33E",
    wikipediaTitle: "Post-Impressionism",
    artists: [
      "Vincent van Gogh",
      "Paul Cézanne",
      "Paul Gauguin",
      "Georges Seurat",
      "Henri de Toulouse-Lautrec",
    ],
  },
  {
    slug: "expressionism",
    name: "Expressionism",
    startYear: 1905,
    endYear: 1935,
    color: "#B5533F",
    wikipediaTitle: "Expressionism",
    artists: ["Edvard Munch", "Egon Schiele", "Wassily Kandinsky", "Franz Marc"],
  },

  // ── Shown for the full sweep; copyright-limited galleries ──────────────
  {
    slug: "cubism",
    name: "Cubism",
    startYear: 1907,
    endYear: 1925,
    color: "#7C7F8A",
    wikipediaTitle: "Cubism",
    artists: ["Juan Gris", "Robert Delaunay", "Albert Gleizes", "Jean Metzinger"],
    lite: true,
  },
  {
    slug: "surrealism",
    name: "Surrealism",
    startYear: 1920,
    endYear: 1950,
    color: "#7E6BA8",
    wikipediaTitle: "Surrealism",
    artists: ["Giorgio de Chirico", "Max Ernst", "Joan Miró", "Yves Tanguy"],
    lite: true,
  },
  {
    slug: "abstract-expressionism",
    name: "Abstract Expressionism",
    startYear: 1943,
    endYear: 1965,
    color: "#C24D54",
    wikipediaTitle: "Abstract expressionism",
    artists: ["Jackson Pollock", "Mark Rothko", "Willem de Kooning"],
    lite: true,
  },
  {
    slug: "pop-art",
    name: "Pop Art",
    startYear: 1955,
    endYear: 1970,
    color: "#E2693E",
    wikipediaTitle: "Pop art",
    artists: ["Andy Warhol", "Roy Lichtenstein", "Robert Rauschenberg"],
    lite: true,
  },
  {
    slug: "contemporary",
    name: "Contemporary",
    startYear: 1970,
    endYear: 2025,
    color: "#9AA0A6",
    wikipediaTitle: "Contemporary art",
    artists: [
      "Gerhard Richter",
      "David Hockney",
      "Jean-Michel Basquiat",
      "Yayoi Kusama",
    ],
    lite: true,
  },
];
