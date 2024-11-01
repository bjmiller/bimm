import { type ReactNode } from 'react';
import { trpcReact } from '../lib/trpc';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
dayjs.extend(duration);

interface CellProps {
  children: ReactNode;
}

const Cell = (props: CellProps) => {
  return (
    <td className="border border-slate-100 p-0.75 pt-1">
      <span className="inline-block">{props.children}</span>
    </td>
  );
};

export const AlbumList = () => {
  const rootsQuery = trpcReact.settings.getSettings.useQuery();
  const root = rootsQuery.data?.directories?.[0];
  const albumsQuery = trpcReact.file.getAlbumDirectories.useQuery(root);
  if (albumsQuery.isLoading) {
    return <div className="album-list">Loading... &#57862;</div>;
  }
  if (albumsQuery.isSuccess) {
    const entries = albumsQuery.data;
    return (
      <table className="album-list text-xxs border-collapse">
        {entries
          .filter((entry) => entry.tracks?.length ?? 0 > 0)
          .map((entry) => {
            const runningtime = entry.tracks?.reduce((memo, track) => memo + (track?.duration ?? 0), 0);
            return (
              <tr key={entry.filename}>
                <Cell>{entry.filename}</Cell>
                <Cell>{entry.mtime?.toISOString()}</Cell>
                <Cell>{entry.tracks?.length}</Cell>
                <Cell>{runningtime ? dayjs.duration(runningtime, 'seconds').format('HH:mm:ss') : null}</Cell>
              </tr>
            );
          })}
      </table>
    );
  }
};
