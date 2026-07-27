import worldCountries from 'world-countries';
// `world-cities-json` ships no type declarations, so the raw import is typed
// as `any`. We validate it once with a Zod schema (matching the codebase's
// existing pattern, e.g. `BandcampSearch.parse`) to get a typed, trusted
// shape before reading any fields.
// @ts-expect-error - no type declarations available for 'world-cities-json'
import worldCitiesJsonRaw from 'world-cities-json';
import { z } from 'zod';
import type { Album } from '../../types';

// --- One-time-derived place/demonym lookup sets ---------------------------------
//
// These datasets are large and static, so they are distilled once at module
// initialization into lowercased `Set<string>` instances for O(1) membership
// checks.

const WorldCity = z.object({
  city: z.string(),
  city_ascii: z.string(),
  lat: z.string(),
  lng: z.string(),
  country: z.string(),
  iso2: z.string(),
  iso3: z.string(),
  admin_name: z.string(),
  capital: z.string(),
  population: z.string(),
  id: z.string()
});
const WorldCities = z.object({ cities: z.array(WorldCity) });

// Use safeParse so a malformed package payload never throws at module load
// and breaks rendering. On failure we fall back to an empty city list.
const worldCities = WorldCities.safeParse(worldCitiesJsonRaw).data ?? { cities: [] };

// `world-countries` ships its own types, but we still validate the specific
// fields we read so that missing/empty values are filtered by the schema
// (via `.min(1)`) rather than by manual `if` checks downstream.
const CountryDemonymByLang = z.object({
  m: z.string().min(1),
  f: z.string().min(1)
});
const CountryName = z.object({
  common: z.string().min(1)
});
const Country = z.object({
  name: CountryName,
  demonyms: z.object({ eng: CountryDemonymByLang }).optional()
});

const countries = worldCountries
  .map((raw) => Country.safeParse(raw).data)
  .filter((country): country is z.infer<typeof Country> => country != null);

const PLACE_NAME_TOKENS: ReadonlySet<string> = (() => {
  const tokens = new Set<string>();

  // English demonyms (adjectival forms) from world-countries: demonyms.eng.m / .f.
  for (const country of countries) {
    const eng = country.demonyms?.eng;
    if (eng == null) continue;
    tokens.add(eng.m.toLowerCase());
    tokens.add(eng.f.toLowerCase());
  }

  // City names from world-cities-json
  // Fun fact: There's a city named "Pop" in Uzbekistan.
  const cityExclusions = ['pop'];
  for (const cityRecord of worldCities.cities) {
    if (!cityExclusions.includes(cityRecord.city_ascii.toLowerCase())) {
      tokens.add(cityRecord.city_ascii.toLowerCase());
    }
  }

  return tokens;
})();

// Source priority weights. Higher = more relevant.
const SOURCE_WEIGHT = {
  manualTags: 100,
  spotifyGenres: 60,
  bandcampTags: 30
} as const;

// Score bonuses/penalties.
const MULTI_SOURCE_BONUS = 20;
const PLACE_NAME_PENALTY = 50;
const NESTED_TAG_PENALTY = 15;

interface GenreScore {
  readonly genre: string;
  readonly score: number;
}

const normalize = (value: string): string => value.trim().toLowerCase();

const containsPlaceToken = (normalizedGenre: string): boolean => {
  // Match either the whole tag or any hyphen/space-separated token.
  if (PLACE_NAME_TOKENS.has(normalizedGenre)) return true;
  const tokens = normalizedGenre.split(/[\s-]+/);
  const hasPlaceName = tokens.some((token) => PLACE_NAME_TOKENS.has(token));
  return hasPlaceName;
};

/**
 * Sort genre tags by relevance without omitting any.
 *
 * Scoring inputs:
 * - source priority (manual > spotify > bandcamp)
 * - cross-source duplication bonus
 * - place-name / demonym penalty (e.g. "italian", "berlin")
 * - descriptive/source-term penalty (e.g. "live", "soundtrack")
 * - nested-tag penalty (e.g. "rock" when "post-rock" also exists)
 *
 * All input genres are returned, only their order changes.
 */
export const sortGenresByRelevance = (album: Album): string[] => {
  const manual = album.manualTags ?? [];
  const spotify = album.spotifyGenres ?? [];
  const bandcamp = album.bandcampTags ?? [];

  // Track each genre's source weight and presence count.
  const sourceMap = new Map<string, { maxSourceWeight: number; sourceCount: number }>();

  const record = (genre: string, weight: number) => {
    const trimmed = genre.trim();
    if (trimmed.length === 0) return;
    const existing = sourceMap.get(trimmed);
    if (existing == null) {
      sourceMap.set(trimmed, { maxSourceWeight: weight, sourceCount: 1 });
    } else {
      existing.maxSourceWeight = Math.max(existing.maxSourceWeight, weight);
      existing.sourceCount += 1;
    }
  };

  manual.forEach((genre) => record(genre, SOURCE_WEIGHT.manualTags));
  spotify.forEach((genre) => record(genre, SOURCE_WEIGHT.spotifyGenres));
  bandcamp.forEach((genre) => record(genre, SOURCE_WEIGHT.bandcampTags));

  const uniqueGenres = [...sourceMap.keys()];

  const scored: GenreScore[] = uniqueGenres.map((genre) => {
    const normalized = normalize(genre);
    const { maxSourceWeight, sourceCount } = sourceMap.get(genre)!;

    let score = maxSourceWeight;
    if (sourceCount > 1) {
      score += MULTI_SOURCE_BONUS;
    }
    if (containsPlaceToken(normalized)) score -= PLACE_NAME_PENALTY;

    // Nested-tag penalty: if this genre is a strict substring of another genre
    // in the set, it is less informative (e.g. "rock" vs "post-rock").
    const isNested = uniqueGenres.some((other) => {
      if (other === genre) return false;
      const otherNormalized = normalize(other);
      return otherNormalized !== normalized && otherNormalized.includes(normalized);
    });
    if (isNested) {
      score -= NESTED_TAG_PENALTY;
    }

    return { genre, score };
  });

  // Sort by score descending; tie-break alphabetically for stable output.
  scored.sort((a, b) => b.score - a.score || a.genre.localeCompare(b.genre));

  return scored.map((entry) => entry.genre);
};
