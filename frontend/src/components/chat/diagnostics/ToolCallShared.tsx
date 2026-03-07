/**
 * Shared sub-components for tool call display.
 * Used by ToolCallCard (inline) and ToolCallDetail (detail pane).
 */
import { useState } from 'react';
import {
    MagnifyingGlassIcon,
    GlobeAltIcon,
    CalculatorIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    BoltIcon,
    WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';

/** Icon for a progress event stage */
export function StageIcon({ stage }: { stage: string }) {
    const cls = 'h-3.5 w-3.5';
    if (stage.includes('search') || stage.includes('lookup')) return <MagnifyingGlassIcon className={`${cls} text-blue-500`} />;
    if (stage.includes('fetch') || stage.includes('read')) return <GlobeAltIcon className={`${cls} text-teal-500`} />;
    if (stage.includes('comput') || stage.includes('formula')) return <CalculatorIcon className={`${cls} text-amber-500`} />;
    if (stage.includes('complete') || stage.includes('done') || stage.includes('answer') || stage.includes('row_done')) return <CheckCircleIcon className={`${cls} text-green-500`} />;
    if (stage.includes('error') || stage.includes('fail')) return <ExclamationTriangleIcon className={`${cls} text-red-500`} />;
    if (stage.includes('start') || stage.includes('enrich')) return <BoltIcon className={`${cls} text-indigo-500`} />;
    if (stage.includes('skip')) return <BoltIcon className={`${cls} text-gray-400`} />;
    return <WrenchScrewdriverIcon className={`${cls} text-gray-400`} />;
}

/** Collapsible block for search/fetch result text in progress events */
export function ResultBlock({ text }: { text: string }) {
    const [expanded, setExpanded] = useState(false);
    const lines = text.split('\n');
    const isLong = lines.length > 6 || text.length > 400;
    const preview = isLong && !expanded ? lines.slice(0, 6).join('\n') : text;
    return (
        <div className="border-l-2 border-gray-200 dark:border-gray-700 pl-2 mt-1">
            <pre className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-pre-wrap break-words max-h-48 overflow-auto">
                {preview}{isLong && !expanded && '…'}
            </pre>
            {isLong && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="text-[10px] text-blue-500 hover:text-blue-700 dark:text-blue-400 mt-0.5"
                >
                    {expanded ? 'Show less' : `Show all (${text.length} chars)`}
                </button>
            )}
        </div>
    );
}

/** Renders rich detail for a progress event's data field */
export function ProgressEventDetail({ data }: { data: Record<string, unknown> }) {
    const outcome = data.outcome as string | undefined;
    const value = data.value as string | undefined;
    const explanation = data.explanation as string | undefined;
    const result = data.result as string | undefined;

    return (
        <div className="mt-0.5 space-y-1">
            {outcome && (
                <div className={`flex items-center gap-1.5 text-xs ${
                    outcome === 'found' ? 'text-green-600 dark:text-green-400' :
                    outcome === 'error' ? 'text-red-600 dark:text-red-400' :
                    'text-amber-600 dark:text-amber-400'
                }`}>
                    {outcome === 'found' ? (
                        <CheckCircleIcon className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                        <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="font-medium">{outcome}</span>
                    {value && <span className="text-gray-700 dark:text-gray-300 truncate">— {value.slice(0, 200)}</span>}
                </div>
            )}
            {explanation && (
                <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                    {explanation.slice(0, 300)}
                </div>
            )}
            {result && <ResultBlock text={result} />}
        </div>
    );
}
