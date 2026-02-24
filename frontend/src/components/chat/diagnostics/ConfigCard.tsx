/**
 * Simple config card for displaying key-value pairs
 */

interface ConfigCardProps {
    label: string;
    value: string | number;
}

export function ConfigCard({ label, value }: ConfigCardProps) {
    return (
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</div>
            <div className="font-mono text-sm text-gray-900 dark:text-white">{value}</div>
        </div>
    );
}
