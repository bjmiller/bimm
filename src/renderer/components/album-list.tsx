import { trpcReact } from '../lib/trpc';

export const AlbumList = () => {
  const rootsQuery = trpcReact.settings.getSettings.useQuery();
  const root = rootsQuery.data?.directories?.[0];
  const albumsQuery = trpcReact.file.getAlbumDirectories.useQuery(root);
  if (albumsQuery.isLoading) {
    return <div>Loading... </div>;
  }
  if (albumsQuery.isSuccess) {
    const entries = albumsQuery.data;
    return (
      <table className="text-xs">
        {entries.map((entry) => (
          <tr key={entry.name}>
            <td>{entry.name}</td>
            <td>{entry.path}</td>
          </tr>
        ))}
      </table>
    );
  }
};
