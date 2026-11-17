import { test, expect } from "@playwright/test";
import { pickYear, summaryDate, wikidataDate, type Inception } from "@/scripts/paintingYear";
import { YEAR_OVERRIDES } from "@/scripts/yearOverrides";

// The importer's year rule, offline — real cases from the 2026-11-17 review.

const wd = (year: number, precision = 9, rank: Inception["rank"] = "normal", from?: number, to?: number): Inception =>
  ({ year, precision, rank, from, to });

test("the summary's creation date is read, not other years", () => {
  expect(summaryDate("Where Do We Come From? is an 1897–98 painting by Paul Gauguin.")).toEqual({ from: 1897, to: 1898 });
  expect(summaryDate("is an oil-on-canvas painting by Claude Monet from 1875. It depicts them in the period from 1871 to 1877")).toEqual({ from: 1875, to: 1875 });
  expect(summaryDate("is an oil painting by the French artist Camille Pissarro, from c. 1862–1865.")).toEqual({ from: 1862, to: 1865 });
  expect(summaryDate("by Sandro Botticelli made in the late 1470s or early 1480s.")).toEqual({ from: 1470, to: 1489 });
  expect(summaryDate("is an oil-on-panel painting by Francisco Goya, usually dated to the 1810s.")).toEqual({ from: 1810, to: 1819 });
  expect(summaryDate("The work was begun in Florence around 1820 and not completed until 1856, in Paris.")).toEqual({ from: 1820, to: 1856 });
  expect(summaryDate("The Virgin and Child with Saint John and Angels (c. 1497), also known as The Manchester Madonna")).toEqual({ from: 1497, to: 1497 });
  // bounds, not dates
  expect(summaryDate("a triptych by Hieronymus Bosch, created after 1482.")).toEqual({ from: 1482 });
  expect(summaryDate("This nude was painted before 1824, and is held at the Louvre.")).toEqual({ to: 1824 });
  expect(summaryDate("an oil-on-panel painting completed c.1494 or later by Bosch.")).toEqual({ from: 1494 });
  // not this painting's making
  expect(summaryDate("It was first exhibited in 1877 and acquired by the museum in 1924.")).toBeNull();
  expect(summaryDate("It is variously dated to c. 1425, 1425–1430 and 1431.")).toBeNull();
  expect(summaryDate("the dating is controversial – some give it a very early date, perhaps 1439; others around 1460.")).toBeNull();
  expect(summaryDate("In 1858 Delacroix created an almost identical work for the Paris Salon of 1859.")).toBeNull();
  expect(summaryDate("Inheritance is an oil painting by the Norwegian painter Edvard Munch (1863–1944).")).toBeNull();
});

test("a bare century from Wikidata is never a year", () => {
  expect(wikidataDate([wd(2000, 7)])).toBeNull(); // "20th century"
  expect(wikidataDate([wd(1501, 7), wd(1626)])?.year).toBe(1626);
  expect(wikidataDate([wd(1814, 9, "deprecated"), wd(1900, 7, "normal", 1814, 1816)])?.year).toBe(1814);
  expect(wikidataDate([wd(1593, 9, "deprecated"), wd(1598), wd(1590, 8, "preferred", 1595, 1597)])?.year).toBe(1595);
  expect(wikidataDate([wd(1818, 7, "preferred", 1808), wd(1808, 9, "normal", 1808, 1812)])?.year).toBe(1808);
  expect(wikidataDate([wd(1311, 7)])?.year).toBe(1311); // a real year typed with century precision
});

test("the year: the summary's date, unless Wikidata's falls inside it", () => {
  // Munch: "20th century" on Wikidata, "an 1899–1900 expressionist painting" in the summary
  expect(pickYear({ story: "The Dance of Life is an 1899–1900 expressionist painting by Edvard Munch.", inceptions: [wd(2000, 7)], born: 1863, died: 1944 })).toBe(1899);
  // Ingres: Wikidata's 1856 sits inside "begun around 1820 … completed until 1856"
  expect(pickYear({ story: "The work was begun in Florence around 1820 and not completed until 1856.", inceptions: [wd(1856)] })).toBe(1856);
  // Goya: the title's 1808 is the event; no creation date in the summary → Wikidata
  expect(pickYear({ story: "The Second of May 1808 is a painting by Francisco Goya.", inceptions: [wd(1814)], born: 1746, died: 1828 })).toBe(1814);
  // Caravaggio's own dates in parentheses are not the painting's
  expect(pickYear({ story: "Bacchus is an oil painting by Caravaggio (1571–1610) commissioned by Cardinal del Monte.", inceptions: [wd(1590, 8, "preferred", 1595, 1597)], born: 1571, died: 1610 })).toBe(1595);
  // "painted before 1824" bounds Wikidata's 1821; alone it is no year
  expect(pickYear({ story: "This nude was painted before 1824.", inceptions: [wd(1821)] })).toBe(1821);
  expect(pickYear({ story: "The Bacchantines is a painting by Angelica Kauffman, painted no later than 1786." })).toBeNull();
  // Wikidata's year outside the artist's life is discarded
  expect(pickYear({ story: "", inceptions: [wd(1900)], born: 1746, died: 1828 })).toBeNull();
});

test("reviewed exceptions are keyed by Wikidata id", () => {
  for (const [qid, year] of Object.entries(YEAR_OVERRIDES)) {
    expect(qid).toMatch(/^Q\d+$/);
    expect(year).toBeGreaterThan(1200);
  }
  expect(YEAR_OVERRIDES.Q969377).toBe(1599); // The Calling of Saint Matthew
});
