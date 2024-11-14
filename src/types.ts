export interface AppSettings {
  directories?: string[];
}

export interface TRPCContext {
  settings?: AppSettings;
}

export interface Album {
  filename: string;
  fullpath: string;
  mtime?: Date;
  title?: string;
  tracks?: Track[];
  spotifyGenres?: string[];
  bandcampTags?: string[];
}

export interface AlbumMetadata {
  mtime?: Date;
  spotifyGenres?: string[];
  bandcampTags?: string[];
}

export interface Track {
  filename: string;
  fullPath: string;
  title?: string;
  duration?: number;
  disk?: number | null;
  track?: number | null;
  year?: number;
  includedGenre?: string[];
}
