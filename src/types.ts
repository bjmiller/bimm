import z from 'zod';

export interface IconProps {
  className?: string;
}

export const AppSettings = z.object({
  home: z.string(),
  directories: z.array(z.string()).optional(),
  inbox: z.string().optional(),
  vlcPassword: z.string().optional()
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

export const AlbumMetadata = z
  .object({
    spotifyGenres: z.array(z.string()).optional(),
    bandcampTags: z.array(z.string()).optional(),
    manualTags: z.array(z.string()).optional()
  })
  .strict();
export type AlbumMetadata = z.infer<typeof AlbumMetadata>;

export const Album = z
  .object({
    filename: z.string(),
    fullpath: z.string(),
    mtime: z.date().optional(),
    title: z.string().optional(),
    tracks: z.array(Track).optional()
  })
  .extend(AlbumMetadata.shape);

export type Album = z.infer<typeof Album>;
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
} & AlbumMetadata;

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

export const VlcCommand = z.discriminatedUnion('command', [
  // No-op / reachability probe
  z.object({ command: z.null() }),

  // Commands with no additional parameters
  z.object({ command: z.literal('pl_stop') }),
  z.object({ command: z.literal('pl_next') }),
  z.object({ command: z.literal('pl_previous') }),
  z.object({ command: z.literal('pl_empty') }),
  z.object({ command: z.literal('pl_random') }),
  z.object({ command: z.literal('pl_loop') }),
  z.object({ command: z.literal('pl_repeat') }),
  z.object({ command: z.literal('fullscreen') }),
  z.object({ command: z.literal('snapshot') }),
  z.object({ command: z.literal('pl_forcepause') }),
  z.object({ command: z.literal('pl_forceresume') }),
  z.object({ command: z.literal('unset_renderer') }),

  // Commands requiring val
  z.object({ command: z.literal('addsubtitle'), val: z.string() }),
  z.object({ command: z.literal('volume'), val: z.string() }),
  z.object({ command: z.literal('seek'), val: z.string() }),
  z.object({ command: z.literal('key'), val: z.string() }),
  z.object({ command: z.literal('audiodelay'), val: z.string() }),
  z.object({ command: z.literal('rate'), val: z.string() }),
  z.object({ command: z.literal('subdelay'), val: z.string() }),
  z.object({ command: z.literal('aspectratio'), val: z.string() }),
  z.object({ command: z.literal('preamp'), val: z.string() }),
  z.object({ command: z.literal('enableeq'), val: z.string() }),
  z.object({ command: z.literal('setpreset'), val: z.string() }),
  z.object({ command: z.literal('title'), val: z.string() }),
  z.object({ command: z.literal('chapter'), val: z.string() }),
  z.object({ command: z.literal('audio_track'), val: z.string() }),
  z.object({ command: z.literal('video_track'), val: z.string() }),
  z.object({ command: z.literal('subtitle_track'), val: z.string() }),

  // Commands requiring input (with optional extras)
  z.object({
    command: z.literal('in_enqueue'),
    input: z.string(),
    options: z.array(z.string()).optional(),
    name: z.string().optional(),
    duration: z.number().optional()
  }),
  z.object({
    command: z.literal('in_play'),
    input: z.string(),
    options: z.array(z.string()).optional(),
    name: z.string().optional(),
    duration: z.number().optional()
  }),

  // Commands requiring id
  z.object({ command: z.literal('pl_delete'), id: z.number() }),
  z.object({ command: z.literal('set_renderer'), id: z.number() }),

  // Commands with optional id
  z.object({ command: z.literal('pl_play'), id: z.number().optional() }),
  z.object({ command: z.literal('pl_pause'), id: z.number().optional() }),

  // pl_sort: requires val, optional id
  z.object({ command: z.literal('pl_sort'), val: z.string(), id: z.number().optional() }),

  // equalizer: requires band and val
  z.object({ command: z.literal('equalizer'), band: z.number(), val: z.string() })
]);
export type VlcCommand = z.infer<typeof VlcCommand>;

export interface VlcLaunchCommand {
  args: string[];
  command: string;
}

export interface VlcWebRequestOptions {
  timeoutMs?: number;
}
