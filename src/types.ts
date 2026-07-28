import z from 'zod';

export interface IconProps {
  className?: string;
}

// --- node-unrar-js runtime validators -------------------------------------
//
// `createExtractorFromFile` returns an `Extractor` whose runtime shape is
// produced by the WASM bindings. We validate the methods we rely on so that
// upstream changes to node-unrar-js fail loudly instead of silently producing
// malformed extractions.

export const RarFileHeader = z.object({
  name: z.string(),
  flags: z.object({
    directory: z.boolean()
  })
});
export type RarFileHeader = z.infer<typeof RarFileHeader>;

export interface RarExtractor {
  getFileList: () => { fileHeaders: Generator<RarFileHeader> };
  extract: (options: { files: string[] }) => { files: Generator<{ fileHeader: RarFileHeader }> };
}

// `createExtractorFromFile` returns an `Extractor` whose runtime shape is
// produced by WASM bindings. We validate the methods we rely on so that
// upstream changes to node-unrar-js fail loudly instead of silently producing
// malformed extractions. A custom guard is used (rather than `z.function()`)
// because method-bearing objects are best validated structurally.
export const RarExtractor = z.custom<RarExtractor>(
  (value): value is RarExtractor => {
    if (typeof value !== 'object' || value === null) return false;
    const obj = value as Record<string, unknown>;
    return typeof obj.getFileList === 'function' && typeof obj.extract === 'function';
  },
  { message: 'Expected a node-unrar-js Extractor with getFileList and extract methods' }
);

export const AppSettings = z.object({
  home: z.string(),
  directories: z.array(z.string()).optional(),
  inbox: z.string().optional(),
  vlcPassword: z.string().optional(),
  tempDirectory: z.string().optional(),
  newAlbumTargetDirectory: z.string().optional()
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

const AlbumBase = z.object({
  filename: z.string(),
  fullpath: z.string(),
  mtime: z.date().optional(),
  title: z.string().optional(),
  tracks: z.array(Track)
});

export const Album = AlbumBase.extend(AlbumMetadata.shape);

export type Album = z.infer<typeof Album>;

// Payload for editing an album's tags. Only the metadata fields travel over
// the wire: the main process merges them into whatever `bimm.json` already
// holds, so unknown/future keys are never dropped by a tag edit.
export const AlbumTagUpdate = z.object({
  albumPath: z.string().min(1),
  tags: AlbumMetadata
});
export type AlbumTagUpdate = z.infer<typeof AlbumTagUpdate>;

export const CompressedFile = z
  .object({
    filename: z.string(),
    fullpath: z.string(),
    mtime: z.date().optional()
  })
  .strict();
export type CompressedFile = z.infer<typeof CompressedFile>;

export const InboxEntry = z.union([Album, CompressedFile]);
export type InboxEntry = z.infer<typeof InboxEntry>;

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
  preview_url: z.union([z.string(), z.null()]),
  duration_ms: z.union([z.coerce.number(), z.undefined()]),
  popularity: z.union([z.coerce.number(), z.undefined()]),
  album: ChosicAlbum
});
export type ChosicTrack = z.infer<typeof ChosicTrack>;

const ChosicArtistDetails = z.object({
  id: z.string(),
  name: z.string(),
  popularity: z.union([z.string(), z.number()]),
  followers: z.union([z.string(), z.number()]),
  image: z.string(),
  updated_date: z.string().optional(),
  genres: z.array(z.string()),
  cached: z.number().optional()
});

export const ChosicArtistSearch = z.object({
  artists: z.array(ChosicArtistDetails)
});
export type ChosicArtistSearch = z.infer<typeof ChosicArtistSearch>;

export const BandcampSearchResult = z.object({
  type: z.union([z.literal('a'), z.literal('b'), z.literal('t')]),
  id: z.number(),
  art_id: z.number(),
  img_id: z.null(),
  name: z.string(),
  band_id: z.number(),
  band_name: z.string(),
  item_url_root: z.string(),
  item_url_path: z.string(),
  img: z.string(),
  tag_names: z.null().optional(),
  stat_params: z.string(),
  album_name: z.string().optional(),
  album_id: z.number().optional()
});
export type BandcampSearchResult = z.infer<typeof BandcampSearchResult>;

export const BandcampSearchGenre = z.object({});
export type BandcampSearchGenre = z.infer<typeof BandcampSearchGenre>;

export const BandcampSearchTag = z.object({
  matches: z.array(z.any()),
  count: z.number(),
  time_ms: z.number()
});
export type BandcampSearchTag = z.infer<typeof BandcampSearchTag>;

export const BandcampSearchAuto = z.object({
  results: z.array(BandcampSearchResult),
  stat_params_for_tag: z.string(),
  time_ms: z.number()
});
export type BandcampSearchAuto = z.infer<typeof BandcampSearchAuto>;

export const BandcampSearch = z.object({
  auto: BandcampSearchAuto,
  tag: BandcampSearchTag,
  genre: BandcampSearchGenre
});
export type BandcampSearch = z.infer<typeof BandcampSearch>;

export const BandcampAlbumBand = z.object({
  band_id: z.number(),
  name: z.string(),
  image_id: z.number(),
  bio: z.string(),
  location: z.string()
});
export type BandcampAlbumBand = z.infer<typeof BandcampAlbumBand>;

export const BandcampAlbumPackageDetailsLite = z.object({
  title: z.string(),
  image_ids: z.array(z.number())
});
export type BandcampAlbumPackageDetailsLite = z.infer<typeof BandcampAlbumPackageDetailsLite>;

export const BandcampAlbumGeoname = z.object({
  id: z.number(),
  name: z.string(),
  fullname: z.string()
});
export type BandcampAlbumGeoname = z.infer<typeof BandcampAlbumGeoname>;

export const BandcampAlbumStreamingUrl = z.record(z.string(), z.string()).optional();
export type BandcampAlbumStreamingUrl = z.infer<typeof BandcampAlbumStreamingUrl>;

export const BandcampAlbumTag = z.object({
  name: z.string(),
  norm_name: z.string(),
  url: z.string(),
  isloc: z.boolean(),
  loc_id: z.union([z.number(), z.null()]),
  geoname: z.union([BandcampAlbumGeoname, z.null()])
});
export type BandcampAlbumTag = z.infer<typeof BandcampAlbumTag>;

export const BandcampAlbumTrack = z.object({
  track_id: z.number(),
  track_license_id: z.union([z.string(), z.number(), z.null()]),
  title: z.string(),
  track_num: z.number(),
  streaming_url: BandcampAlbumStreamingUrl,
  duration: z.number(),
  encodings_id: z.number(),
  album_title: z.union([z.string(), z.null()]),
  band_name: z.string(),
  art_id: z.union([z.number(), z.null()]),
  album_id: z.number(),
  is_streamable: z.boolean(),
  has_lyrics: z.boolean(),
  is_set_price: z.boolean(),
  price: z.number(),
  has_digital_download: z.boolean(),
  merch_ids: z.union([z.array(z.string()), z.array(z.number()), z.null()]),
  merch_sold_out: z.union([z.boolean(), z.null()]),
  currency: z.string(),
  require_email: z.boolean(),
  is_purchasable: z.boolean(),
  band_id: z.number(),
  label: z.union([z.string(), z.null()]),
  label_id: z.union([z.number(), z.null()]),
  track_url: z.string()
});
export type BandcampAlbumTrack = z.infer<typeof BandcampAlbumTrack>;

export const BandcampAlbumDetails = z.object({
  id: z.number(),
  type: z.string(),
  title: z.string(),
  bandcamp_url: z.string(),
  art_id: z.number(),
  band: BandcampAlbumBand,
  tralbum_artist: z.string(),
  package_art: z.array(z.number()),
  featured_track_id: z.number(),
  tracks: z.array(BandcampAlbumTrack),
  credits: z.string(),
  about: z.string(),
  album_id: z.number(),
  album_title: z.string(),
  release_date: z.number(),
  is_purchasable: z.boolean(),
  free_download: z.boolean(),
  is_preorder: z.boolean(),
  tags: z.union([z.array(BandcampAlbumTag), z.null()]),
  currency: z.string(),
  is_set_price: z.boolean(),
  price: z.number(),
  require_email: z.boolean(),
  label: z.union([z.string(), z.null()]),
  label_id: z.union([z.number(), z.null()]),
  package_details_lite: z.record(z.string(), BandcampAlbumPackageDetailsLite),
  has_digital_download: z.boolean(),
  num_downloadable_tracks: z.number(),
  merch_sold_out: z.boolean(),
  streaming_limit: z.number()
});
export type BandcampAlbumDetails = z.infer<typeof BandcampAlbumDetails>;

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
