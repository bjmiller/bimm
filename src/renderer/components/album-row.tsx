import { type ReactNode } from 'react';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { type Entry } from '../../types';
import clsx from 'clsx';
dayjs.extend(duration);

export type AlbumRowProps = {
  entry: Entry;
};

interface CellProps {
  children: ReactNode;
  flexible?: boolean;
  className?: string;
}

const Cell = (props: CellProps) => {
  return (
    <td
      className={clsx(
        'p-0.75 pt-1 px-1.5 whitespace-nowrap',
        props.flexible ? ['max-w-0 overflow-hidden'] : ['w-0'],
        props.className
      )}
    >
      <span className="inline-block">{props.children}</span>
    </td>
  );
};

export const AlbumRow = (props: AlbumRowProps) => {
  const entry = props.entry;
  const runningtime = entry.tracks?.reduce((memo, track) => memo + (track?.duration ?? 0), 0);
  return (
    <tr key={entry.filename} className="cursor-default">
      <Cell flexible>
        <span>{entry.filename}</span>
      </Cell>
      <Cell>{runningtime ? dayjs.duration(runningtime, 'seconds').format('HH:mm:ss') : null}</Cell>
      <Cell className="text-right">{entry.tracks?.length}</Cell>
      <Cell>{dayjs(entry.mtime).format('YYYY-MM-DD HH:mm')}</Cell>
    </tr>
  );
};
