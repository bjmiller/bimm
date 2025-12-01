import clsx from 'clsx';

export type SidePanelProps = {
  className?: string;
};

const SidePanel = ({ className }: SidePanelProps) => {
  return (
    <div className={clsx('side-panel h-screen w-1/6 bg-[#dfdfdf]', className)}>
      <div className="side-panel-content">Side Panel</div>
    </div>
  );
};

export default SidePanel;
