/**
 * Painting years settled by hand in the 2026-11-17 review where the rule in
 * paintingYear.ts would pick another year from the same sources. Keyed by
 * Wikidata QID, since the importer re-creates painting rows on every run.
 */
export const YEAR_OVERRIDES: Record<string, number> = {
  Q727875: 1538, // Venus of Urbino — the conventional date; "begun 1532 or 1534" is when work started
  Q574004: 1440, // Crucifixion and Last Judgement diptych — sources differ (Wikidata 1436–1438)
  Q969377: 1599, // The Calling of Saint Matthew — "completed in 1599–1600"
  Q323141: 1507, // Heller Altarpiece — "executed between 1507 and 1509"
  Q2360329: 1503, // Three Graces — "possibly 1503-1505"
  Q7536969: 1885, // Skull of a Skeleton with Burning Cigarette — "the winter of 1885–86"
};
