import { trpcReact } from '../lib/trpc';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { AlbumRow } from './album-row';
dayjs.extend(duration);

export const AlbumList = () => {
  const rootsQuery = trpcReact.settings.getSettings.useQuery();
  const root = rootsQuery.data?.directories?.[0];
  const albumsQuery = trpcReact.file.getAlbums.useQuery(root);

  if (albumsQuery.isLoading) {
    return (
      <div className="album-list flex flex-row">
        <div className="h-fit">Loading... </div>
        <div className="animate-spin inline-block h-fit">&#57862;</div>
      </div>
    );
  }
  if (albumsQuery.isSuccess) {
    const entries = albumsQuery.data;
    return (
      <div className="album-list h-lvh overflow-y-scroll flex-auto">
        <table className="album-list text-xs border-collapse w-full">
          {entries
            .filter((entry) => entry.tracks?.length ?? 0 > 0)
            .map((entry) => (
              <AlbumRow entry={entry} />
            ))}
        </table>
      </div>
    );
  }
};
