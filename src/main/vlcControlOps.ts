import { type Track, type Album, type VlcCommand } from '../types';
import { readOrCreateSettings } from './backendOps';

export const playAlbum = async (album: Album) => {
  const tracks = album.tracks;
  // eslint-disable-next-line no-magic-numbers
  tracks?.sort((l: Track, r: Track) => (l.disk ?? 1) * 1000 + (l.track ?? 1) - ((r.disk ?? 1) * 1000 + (r.track ?? 1)));
  if (tracks != null) {
    for (const track of tracks) {
      // eslint-disable-next-line no-await-in-loop
      await enqueue(track);
    }
    await sendToVlcWeb({ command: 'pl_play' });
  }
};

const sendToVlcWeb = async (vlcCommand: VlcCommand) => {
  const vlcPassword = (await readOrCreateSettings())?.vlcPassword ?? '';
  const encodedCreds = Buffer.from(`:${vlcPassword}`).toString('base64');
  const Authorization = `Basic ${encodedCreds}`;

  const url = new URL('http://localhost:8080/status.xml');
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(vlcCommand)) {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        for (const item of value) {
          params.append(key, item);
        }
      } else {
        params.append(key, String(value));
      }
    }
  }
  url.search = params.toString();

  await fetch(url, { headers: { Authorization } });
};

const enqueue = async (track: Track) => {
  await sendToVlcWeb({ command: 'in_enqueue', input: `file:${track.fullPath}` });
};
