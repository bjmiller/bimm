import type React from 'react';
import clsx from 'clsx';
import { type IconProps } from '../../types';
import { useSidePanelItemInteractions } from '../lib/focusManagement';

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
          'side-panel-item flex cursor-pointer items-center focus:inset-ring-1 focus:inset-ring-orange-400 focus:outline-none',
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
        <div>{displayName ?? itemName}</div>
      </div>
    </>
  );
};
