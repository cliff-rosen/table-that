/**
 * Collapsible section with optional fullscreen button
 */
import { ChevronDownIcon, ChevronRightIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/solid';

export interface CollapsibleSectionProps {
    id: string;
    title: string;
    subtitle?: string;
    subtitleColor?: 'orange';
    isExpanded: boolean;
    onToggle: () => void;
    onFullscreen?: () => void;
    children: React.ReactNode;
}

export function CollapsibleSection({ title, subtitle, subtitleColor, isExpanded, onToggle, onFullscreen, children }: CollapsibleSectionProps) {
    return (
        <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
            <div className="flex items-center bg-gray-50 dark:bg-gray-700/30">
                <button
                    onClick={onToggle}
                    className="flex-1 flex items-center gap-3 p-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700/50"
                >
                    {isExpanded ? (
                        <ChevronDownIcon className="h-4 w-4 text-gray-400" />
                    ) : (
                        <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                    )}
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</span>
                    {subtitle && (
                        <span className={`text-xs ${
                            subtitleColor === 'orange'
                                ? 'text-orange-600 dark:text-orange-400'
                                : 'text-gray-500 dark:text-gray-400'
                        }`}>
                            {subtitle}
                        </span>
                    )}
                </button>
                {onFullscreen && (
                    <button
                        onClick={onFullscreen}
                        className="p-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title="View fullscreen"
                    >
                        <ArrowsPointingOutIcon className="h-4 w-4" />
                    </button>
                )}
            </div>
            {isExpanded && (
                <div className="p-3 border-t border-gray-200 dark:border-gray-600">
                    {children}
                </div>
            )}
        </div>
    );
}
