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
      <div className="flex flex-row">
        <div className="album-list">Loading... </div>
        <div className="animate-spin w-6 h-6 pr-[6px] pt-[1px] text-center">&#57862;</div>
      </div>
    );
  }
  if (albumsQuery.isSuccess) {
    const entries = albumsQuery.data;
    return (
      <>
        <table className="album-list text-xxs border-collapse w-full">
          {entries
            .filter((entry) => entry.tracks?.length ?? 0 > 0)
            .map((entry) => (
              <AlbumRow entry={entry} />
            ))}
        </table>
      </>
    );
  }
};
