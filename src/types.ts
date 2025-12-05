import z from 'zod';

export interface AppSettings {
  home: string;
  directories?: string[];
}

export interface TRPCContext {
  settings?: AppSettings;
}

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
