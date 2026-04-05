import type React from 'react';
import clsx from 'clsx';
import { type IconProps } from '../../types';

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
  return (
    <>
      <div
        className={clsx(
          `side-panel-item flex cursor-pointer items-center ${className}`,
          selected === itemName ? 'bg-[#b3b3b3]' : ''
        )}
        onClick={() => setSelected(itemName)}
      >
        {icon}
        <div>{displayName ?? itemName}</div>
      </div>
    </>
  );
};
