export type LayoutInputPeriod = {
  id: number;
  slug: string;
  name: string;
  startYear: number;
  endYear: number;
  color: string;
  orderIndex: number;
  blurb: string | null;
  wikipediaUrl: string | null;
};

export type LayoutInputArtist = {
  id: number;
  slug: string;
  name: string;
  periodId: number;
  birthYear: number | null;
  deathYear: number | null;
  nationality: string | null;
  bio: string | null;
  portraitUrl: string | null;
  wikipediaUrl: string | null;
  orderIndex: number;
  paintingCount: number;
};

export type LayoutInput = {
  periods: LayoutInputPeriod[];
  artists: LayoutInputArtist[];
};

export type StarArtist = {
  id: number;
  slug: string;
  name: string;
  x: number;
  y: number;
  birthYear: number | null;
  deathYear: number | null;
  nationality: string | null;
  bio: string | null;
  portraitUrl: string | null;
  wikipediaUrl: string | null;
  paintingCount: number;
  periodColor: string;
  periodName: string;
};

export type Galaxy = {
  id: number;
  slug: string;
  name: string;
  startYear: number;
  endYear: number;
  color: string;
  blurb: string | null;
  wikipediaUrl: string | null;
  x: number;
  y: number;
  artists: StarArtist[];
};

export type Layout = {
  width: number;
  height: number;
  galaxies: Galaxy[];
};

/**
 * Lay the periods out as galaxies on a left→right time axis (x blends true date
 * with even index spacing so the dense modern era stays legible), with an
 * organic vertical scatter, and scatter each period's artists as stars around
 * its core. Pure + deterministic, so server and client agree.
 */
export function buildLayout(input: LayoutInput): Layout {
  const minYear = 1180;
  const maxYear = 2035;
  const width = 5200;
  const height = 1900;
  const pad = 360;
  const centerY = height / 2;

  const periods = [...input.periods].sort((a, b) => a.orderIndex - b.orderIndex);
  const n2 = Math.max(periods.length - 1, 1);
  const xForDate = (year: number) =>
    pad + ((year - minYear) / (maxYear - minYear)) * (width - 2 * pad);

  const galaxies: Galaxy[] = periods.map((p, i) => {
    const mid = (p.startYear + p.endYear) / 2;
    const gx = 0.4 * xForDate(mid) + 0.6 * (pad + (i / n2) * (width - 2 * pad));
    const gy = centerY + Math.sin(i * 1.7) * 430 + Math.cos(i * 2.7) * 175;

    const periodArtists = input.artists.filter((a) => a.periodId === p.id);
    const n = Math.max(periodArtists.length, 1);

    const artists: StarArtist[] = periodArtists.map((a, j) => {
      const angle = (j / n) * Math.PI * 2 + i * 0.9;
      const radius = 150 + (j % 2) * 48;
      return {
        id: a.id,
        slug: a.slug,
        name: a.name,
        x: gx + Math.cos(angle) * radius,
        y: gy + Math.sin(angle) * radius * 0.78,
        birthYear: a.birthYear,
        deathYear: a.deathYear,
        nationality: a.nationality,
        bio: a.bio,
        portraitUrl: a.portraitUrl,
        wikipediaUrl: a.wikipediaUrl,
        paintingCount: Number(a.paintingCount),
        periodColor: p.color,
        periodName: p.name,
      };
    });

    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      startYear: p.startYear,
      endYear: p.endYear,
      color: p.color,
      blurb: p.blurb,
      wikipediaUrl: p.wikipediaUrl,
      x: gx,
      y: gy,
      artists,
    };
  });

  return { width, height, galaxies };
}
