import z from 'zod';

export interface IconProps {
  className?: string;
}

export const AppSettings = z.object({
  home: z.string(),
  directories: z.array(z.string()).optional(),
  inbox: z.string().optional()
});

export type AppSettings = z.infer<typeof AppSettings>;

export const Track = z.object({
  filename: z.string(),
  fullPath: z.string(),
  title: z.string().optional(),
  duration: z.number().optional(),
  disk: z.union([z.number(), z.null()]).optional(),
  track: z.union([z.number(), z.null()]).optional(),
  year: z.number().optional(),
  artist: z.string().optional(),
  albumTitle: z.string().optional(),
  includedGenre: z.array(z.string()).optional()
});

export type Track = z.infer<typeof Track>;

export const Album = z.object({
  filename: z.string(),
  fullpath: z.string(),
  mtime: z.date().optional(),
  title: z.string().optional(),
  tracks: z.array(Track).optional(),
  spotifyGenres: z.array(z.string()).optional(),
  bandcampTags: z.array(z.string()).optional(),
  manualTags: z.array(z.string()).optional()
});

export type Album = z.infer<typeof Album>;

export interface AlbumMetadata {
  mtime?: Date;
  spotifyGenres?: string[];
  bandcampTags?: string[];
  manualTags?: string[];
}
export type Entry = {
  filename: string;
  fullpath: string;
  mtime?: Date | undefined;
  title?: string | undefined;
  tracks?: {
    filename: string;
    fullPath: string;
    title?: string | undefined;
    duration?: number | undefined;
    disk?: number | null | undefined;
    track?: number | null | undefined;
    year?: number | undefined;
    artist?: string | undefined;
    albumTitle?: string | undefined;
    includedGenre?: string[] | undefined;
  }[];
};

const ChosicGenreLookupTrack = Track.pick({
  title: true,
  artist: true
});

export const ChosicGenreLookupInput = z.object({
  filename: z.string(),
  tracks: z.array(ChosicGenreLookupTrack).optional()
});

export type ChosicGenreLookupInput = z.infer<typeof ChosicGenreLookupInput>;

const ChosicTrackResult = z.object({
  id: z.string(),
  name: z.string(),
  artist: z.string(),
  image: z.string()
});

const ChosicTrackResults = z.object({
  items: z.array(ChosicTrackResult)
});

export const ChosicTrackSearch = z.object({
  tracks: ChosicTrackResults
});
export type ChosicTrackSearch = z.infer<typeof ChosicTrackSearch>;

const ChosicAlbum = z.object({
  name: z.string(),
  album_type: z.string(),
  release_date: z.string(),
  id: z.string().optional(),
  release_date_precision: z.string(),
  image_default: z.string(),
  image_large: z.string()
});

const ChosicArtistSummary = z.object({
  name: z.string(),
  id: z.string()
});

export const ChosicTrack = z.object({
  id: z.string(),
  name: z.string(),
  artists: z.array(ChosicArtistSummary),
  preview_url: z.string(),
  duration_ms: z.coerce.number(),
  popularity: z.coerce.number(),
  album: ChosicAlbum
});
export type ChosicTrack = z.infer<typeof ChosicTrack>;

const ChosicArtistDetails = z.object({
  id: z.string(),
  name: z.string(),
  popularity: z.string(),
  followers: z.string(),
  image: z.string(),
  updated_date: z.string(),
  genres: z.array(z.string()),
  cached: z.number()
});

export const ChosicArtistSearch = z.object({
  artists: z.array(ChosicArtistDetails)
});
export type ChosicArtistSearch = z.infer<typeof ChosicArtistSearch>;
