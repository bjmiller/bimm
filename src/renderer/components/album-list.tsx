import { useTRPC } from '../lib/trpc';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { AlbumRow } from './album-row';
dayjs.extend(duration);

interface AlbumListProps {
  selected: string | undefined;
}

export const AlbumList = (props: AlbumListProps) => {
  const { selected } = props;
  const trpc = useTRPC();
  const albumsQuery = useQuery(trpc.file.getAlbums.queryOptions(selected));

  if (albumsQuery.isLoading) {
    return (
      <div className="album-list flex flex-row">
        <div className="h-fit">Loading... </div>
        <div className="inline-block h-fit animate-spin">&#57862;</div>
      </div>
    );
  }
  if (albumsQuery.isSuccess) {
    const entries = albumsQuery.data;
    return (
      <div className="album-list h-lvh flex-auto overflow-y-scroll">
        <table className="album-list w-full border-collapse text-xs">
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
