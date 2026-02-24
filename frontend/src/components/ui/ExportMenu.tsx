import { useState } from 'react';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';

export interface ExportOption {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    onClick: () => void | Promise<void>;
}

interface ExportMenuProps {
    options: ExportOption[];
    variant?: 'icon' | 'button';
    align?: 'left' | 'right';
}

export default function ExportMenu({ options, variant = 'icon', align = 'right' }: ExportMenuProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={
                    variant === 'icon'
                        ? 'p-2 rounded-md transition-colors bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        : 'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }
                title="Export"
            >
                <ArrowDownTrayIcon className="h-5 w-5" />
                {variant === 'button' && <span>Export</span>}
            </button>

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />

                    {/* Dropdown */}
                    <div className={`absolute top-full mt-1 w-52 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20 py-1 ${
                        align === 'right' ? 'right-0' : 'left-0'
                    }`}>
                        {options.map((option) => {
                            const Icon = option.icon;
                            return (
                                <button
                                    key={option.label}
                                    type="button"
                                    onClick={() => {
                                        setIsOpen(false);
                                        option.onClick();
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <Icon className="h-4 w-4 flex-shrink-0" />
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
