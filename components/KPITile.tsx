'use client';

interface KPITileProps {
  label: string;
  value: string | number;
  timeframe?: string;
  tooltip?: string;
}

export default function KPITile({ label, value, timeframe, tooltip }: KPITileProps) {
  const formattedValue = typeof value === 'number' 
    ? value.toLocaleString('en-CA')
    : value;

  return (
    <div className="group relative h-full min-w-0 overflow-hidden">
      <div className="card h-full min-h-[100px] flex flex-col overflow-hidden">
        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5 break-words">
          {label}
        </div>
        <div className="text-2xl font-semibold text-gray-900 dark:text-white mb-1 leading-tight flex-grow break-words min-w-0 overflow-hidden">
          {formattedValue}
        </div>
        {timeframe && (
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 break-words">
            {timeframe}
          </div>
        )}
      </div>
      {tooltip && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-normal max-w-xs z-10">
          {tooltip}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
            <div className="border-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      )}
    </div>
  );
}

