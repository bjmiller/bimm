import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
dayjs.extend(duration);

export interface SelectedRunningTimeProps {
  totalSeconds: number;
  selectedCount: number;
}

export const SelectedRunningTime = ({ totalSeconds, selectedCount }: SelectedRunningTimeProps) => {
  if (selectedCount === 0) return null;
  return (
    <div className="side-panel-selected-running-time mt-6 px-2 py-1 text-xs">
      <div className="font-bold">Selected</div>
      <div>
        {selectedCount} album{selectedCount === 1 ? '' : 's'}
      </div>
      <div>{dayjs.duration(totalSeconds, 'seconds').format('HH:mm:ss')}</div>
    </div>
  );
};
