import { type CSSProperties, useMemo } from 'react';
import { tagBackgroundColor } from '../lib/tagColor';

interface GenreProps {
  children: string;
}

export const Genre = (props: GenreProps) => {
  const { children } = props;
  const backgroundColor = useMemo(() => tagBackgroundColor(children), [children]);
  const style: CSSProperties = { backgroundColor };
  return (
    <div className="relative mx-0.75 inline-block rounded-full px-1.5 pt-px text-white" style={style}>
      {children}
    </div>
  );
};
