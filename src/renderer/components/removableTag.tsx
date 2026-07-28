import { type CSSProperties, useCallback, useMemo } from 'react';
import { XIcon } from '../../icons/x';
import { tagBackgroundColor } from '../lib/tagColor';

interface RemovableTagProps {
  onRemove: (tag: string) => void;
  tag: string;
}

/**
 * A tag pill styled like the album list's `Genre`, but split-button style: the
 * label segment is inert and the trailing "X" segment removes the tag. The
 * remove button is not a tab stop — the tag input keeps focus while editing, and
 * pills stay reachable by mouse.
 */
export const RemovableTag = ({ onRemove, tag }: RemovableTagProps) => {
  const backgroundColor = useMemo(() => tagBackgroundColor(tag), [tag]);
  const style: CSSProperties = { backgroundColor };

  const handleRemove = useCallback(() => {
    onRemove(tag);
  }, [onRemove, tag]);

  return (
    <span className="relative m-0.75 inline-flex items-stretch overflow-hidden rounded-full text-white" style={style}>
      <span className="px-1.5 pt-px text-xs select-none">{tag}</span>
      <button
        type="button"
        aria-label={`Remove ${tag}`}
        title={`Remove ${tag}`}
        tabIndex={-1}
        onClick={handleRemove}
        className="flex cursor-pointer items-center border-l border-white/40 px-1 transition-colors hover:bg-black/25 focus-visible:bg-black/25 focus-visible:outline-none active:bg-black/40"
      >
        <XIcon className="size-2.5" />
      </button>
    </span>
  );
};
