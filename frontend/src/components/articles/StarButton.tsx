import { StarIcon as StarOutline } from '@heroicons/react/24/outline';
import { StarIcon as StarSolid } from '@heroicons/react/24/solid';

export interface StarButtonProps {
    isStarred: boolean;
    onToggle: () => void;
    size?: 'sm' | 'md';
    disabled?: boolean;
    className?: string;
}

/**
 * Reusable star toggle button for article starring.
 * Shows filled blue star when starred, gray outline when not.
 */
export default function StarButton({
    isStarred,
    onToggle,
    size = 'md',
    disabled = false,
    className = ''
}: StarButtonProps) {
    const sizeClasses = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
    const buttonSize = size === 'sm' ? 'p-1' : 'p-1.5';

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent triggering parent onClick handlers
        if (!disabled) {
            onToggle();
        }
    };

    return (
        <button
            onClick={handleClick}
            disabled={disabled}
            className={`rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${buttonSize} ${
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            } ${className}`}
            title={isStarred ? 'Remove from favorites' : 'Add to favorites'}
            aria-label={isStarred ? 'Remove from favorites' : 'Add to favorites'}
        >
            {isStarred ? (
                <StarSolid className={`${sizeClasses} text-blue-600 dark:text-blue-400`} />
            ) : (
                <StarOutline className={`${sizeClasses} text-gray-400 hover:text-blue-500 dark:hover:text-blue-400`} />
            )}
        </button>
    );
}
