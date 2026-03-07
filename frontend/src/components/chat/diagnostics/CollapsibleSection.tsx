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
        <div className="border border-gray-100 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="flex items-center">
                <button
                    onClick={onToggle}
                    className="flex-1 flex items-center gap-2 px-2 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                    {isExpanded ? (
                        <ChevronDownIcon className="h-3.5 w-3.5 text-gray-400" />
                    ) : (
                        <ChevronRightIcon className="h-3.5 w-3.5 text-gray-400" />
                    )}
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{title}</span>
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
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title="View fullscreen"
                    >
                        <ArrowsPointingOutIcon className="h-4 w-4" />
                    </button>
                )}
            </div>
            {isExpanded && (
                <div className="p-2 border-t border-gray-100 dark:border-gray-700">
                    {children}
                </div>
            )}
        </div>
    );
}
