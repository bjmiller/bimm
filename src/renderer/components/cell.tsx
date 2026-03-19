import clsx from 'clsx';
import type { ReactNode } from 'react';

interface CellProps {
  children: ReactNode;
  flexible?: boolean;
  className?: string;
}

export const Cell = (props: CellProps) => {
  return (
    <td
      className={clsx(
        'p-0.75 px-1.5 pt-1 whitespace-nowrap',
        props.flexible ? ['max-w-0 overflow-hidden'] : ['w-0'],
        props.className
      )}
    >
      <span className="inline-block">{props.children}</span>
    </td>
  );
};
