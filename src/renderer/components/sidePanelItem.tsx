import type React from 'react';
import clsx from 'clsx';
import { type IconProps } from '../../types';
import { useSidePanelItemInteractions } from '../lib/focusManagement';
import { TruncatedPath } from './truncatedPath';

export interface SidePanelItemProps {
  itemName: string;
  displayName?: string;
  icon: React.ReactElement<IconProps>;
  selected: string | undefined;
  setSelected: React.Dispatch<React.SetStateAction<string | undefined>>;
  className?: string;
}

export const SidePanelItem = ({
  itemName,
  displayName,
  icon,
  selected,
  setSelected,
  className
}: SidePanelItemProps) => {
  const { onItemClick, onItemKeyDown, onItemMouseDownCapture } = useSidePanelItemInteractions({
    onSelect: () => setSelected(itemName)
  });

  return (
    <>
      <div
        data-side-panel-item
        className={clsx(
          'side-panel-item flex min-w-0 cursor-pointer items-center gap-1 px-1 focus:inset-ring-1 focus:inset-ring-orange-400 focus:outline-none',
          className,
          selected === itemName ? 'bg-[#b3b3b3]' : ''
        )}
        onKeyDown={onItemKeyDown}
        onMouseDownCapture={onItemMouseDownCapture}
        onClick={onItemClick}
        role="button"
        tabIndex={-1}
      >
        {icon}
        <TruncatedPath path={displayName ?? itemName} className="min-w-0 flex-1 overflow-hidden" />
      </div>
    </>
  );
};
