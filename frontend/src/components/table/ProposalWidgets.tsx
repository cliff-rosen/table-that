/**
 * Shared UI widgets for data proposal rendering.
 *
 * OpStatusIcon  — running/success/error indicator per operation
 * ProgressBar   — progress bar during batch apply
 * ResearchLog   — expandable research trace from enrich_column
 */

import { useState } from 'react';
import {
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  GlobeAltIcon,
  DocumentTextIcon,
  CalculatorIcon,
  BoltIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import type { OpResult, ResearchLogEntry, ResearchStep } from '../../lib/utils/dataProposal';

// =============================================================================
// OpStatusIcon
// =============================================================================

export function OpStatusIcon({ result, large }: { result: OpResult; large?: boolean }) {
  const cls = large ? 'h-4 w-4' : 'h-3.5 w-3.5';
  switch (result.status) {
    case 'running':
      return <div className={`${cls} border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0`} />;
    case 'success':
      return <CheckIcon className={`${cls} text-green-600 dark:text-green-400 flex-shrink-0`} />;
    case 'error':
      return (
        <span title={result.error || 'Failed'}>
          <XMarkIcon className={`${cls} text-red-600 dark:text-red-400 flex-shrink-0`} />
        </span>
      );
    default:
      return null;
  }
}

// =============================================================================
// ProgressBar
// =============================================================================

export function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
        <span>Applying changes...</span>
        <span>{current} / {total}</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
        <div
          className="bg-blue-600 dark:bg-blue-400 h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// =============================================================================
// ResearchStepRow
// =============================================================================

function ResearchStepRow({ step, large }: { step: ResearchStep; large?: boolean }) {
  const textCls = large ? 'text-sm' : 'text-xs';
  const iconCls = large ? 'h-4 w-4' : 'h-3.5 w-3.5';
  switch (step.action) {
    case 'search':
    case 'lookup':
      return (
        <div className={`flex items-start gap-1.5 ${textCls}`}>
          <MagnifyingGlassIcon className={`${iconCls} ${step.action === 'lookup' ? 'text-teal-500' : 'text-blue-500'} flex-shrink-0 mt-0.5`} />
          <div className="min-w-0">
            <div>
              <span className="text-gray-500 dark:text-gray-400">{step.action === 'lookup' ? 'Lookup: ' : 'Search: '}</span>
              <span className="text-gray-700 dark:text-gray-300">{step.query || step.detail}</span>
            </div>
            {step.detail && step.query && (
              <div className="text-gray-400 dark:text-gray-500 mt-0.5 pl-1 border-l-2 border-gray-200 dark:border-gray-700">
                {step.detail}
              </div>
            )}
          </div>
        </div>
      );
    case 'fetch':
      return (
        <div className={`flex items-start gap-1.5 ${textCls}`}>
          <GlobeAltIcon className={`${iconCls} text-purple-500 flex-shrink-0 mt-0.5`} />
          <div className="min-w-0">
            <span className="text-gray-500 dark:text-gray-400">Fetch: </span>
            <span className="text-gray-700 dark:text-gray-300 break-all">{step.url || step.detail}</span>
            {step.detail && step.url && (
              <span className="text-gray-400 dark:text-gray-500"> — {step.detail}</span>
            )}
          </div>
        </div>
      );
    case 'extract':
      return (
        <div className={`flex items-start gap-1.5 ${textCls}`}>
          <DocumentTextIcon className={`${iconCls} text-purple-500 flex-shrink-0 mt-0.5`} />
          <div className="min-w-0">
            <span className="text-gray-500 dark:text-gray-400">Extract: </span>
            <span className="text-gray-700 dark:text-gray-300">{step.detail || step.field || ''}</span>
          </div>
        </div>
      );
    case 'compute':
      return (
        <div className={`flex items-start gap-1.5 ${textCls}`}>
          <CalculatorIcon className={`${iconCls} text-blue-500 flex-shrink-0 mt-0.5`} />
          <div className="min-w-0">
            <span className="text-gray-500 dark:text-gray-400">Compute: </span>
            <code className="text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-1 rounded text-[0.85em]">
              {step.formula || step.detail || ''}
            </code>
          </div>
        </div>
      );
    case 'thinking':
      return (
        <div className={`flex items-start gap-1.5 ${textCls}`}>
          <span className="text-gray-400 flex-shrink-0 mt-0.5">💭</span>
          <span className="text-gray-500 dark:text-gray-400 italic">{step.text}</span>
        </div>
      );
    case 'error':
      return (
        <div className={`flex items-start gap-1.5 ${textCls}`}>
          <ExclamationTriangleIcon className={`${iconCls} text-red-500 flex-shrink-0 mt-0.5`} />
          <span className="text-red-600 dark:text-red-400">{step.detail}</span>
        </div>
      );
    case 'skip':
      return (
        <div className={`flex items-start gap-1.5 ${textCls}`}>
          <BoltIcon className={`${iconCls} text-gray-400 flex-shrink-0 mt-0.5`} />
          <span className="text-gray-500 dark:text-gray-400 italic">{step.detail}</span>
        </div>
      );
    case 'answer':
      return (
        <div className={`flex items-start gap-1.5 ${textCls}`}>
          <CheckIcon className={`${iconCls} text-green-500 flex-shrink-0 mt-0.5`} />
          <div className="min-w-0">
            <span className="text-gray-500 dark:text-gray-400">Result: </span>
            <span className="text-gray-700 dark:text-gray-300 font-medium">
              {step.text || step.detail || step.value || 'No answer'}
            </span>
          </div>
        </div>
      );
    case 'coverage':
      return (
        <div className={`flex items-start gap-1.5 ${textCls}`}>
          <ShieldCheckIcon className={`${iconCls} text-indigo-500 flex-shrink-0 mt-0.5`} />
          <div className="min-w-0">
            <span className="text-gray-500 dark:text-gray-400">Coverage: </span>
            <span className="text-indigo-700 dark:text-indigo-300">{step.detail}</span>
          </div>
        </div>
      );
    default:
      return (
        <div className={`flex items-start gap-1.5 ${textCls}`}>
          <BoltIcon className={`${iconCls} text-gray-400 flex-shrink-0 mt-0.5`} />
          <span className="text-gray-500 dark:text-gray-400">{step.detail || step.text || step.action}</span>
        </div>
      );
  }
}

// =============================================================================
// Strategy Badge
// =============================================================================

const STRATEGY_COLORS: Record<string, string> = {
  lookup: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  research: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  computation: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

const STRATEGY_LABELS: Record<string, string> = {
  lookup: 'Lookup',
  research: 'Research',
  computation: 'Compute',
};

function StrategyBadge({ strategy }: { strategy?: string }) {
  if (!strategy) return null;
  const colorCls = STRATEGY_COLORS[strategy] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  const label = STRATEGY_LABELS[strategy] || strategy.replace(/_/g, ' ');
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none ${colorCls}`}>
      {label}
    </span>
  );
}

// =============================================================================
// Thoroughness Badge
// =============================================================================

function ThoroughnessBadge({ thoroughness }: { thoroughness?: string }) {
  if (!thoroughness || thoroughness !== 'comprehensive') return null;
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
      Comprehensive
    </span>
  );
}

// =============================================================================
// Confidence Indicator
// =============================================================================

function ConfidenceIndicator({ confidence }: { confidence?: string }) {
  if (!confidence || confidence === 'none') return null;
  const colorCls = confidence === 'high'
    ? 'text-green-600 dark:text-green-400'
    : confidence === 'medium'
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-red-500 dark:text-red-400';
  const pct = confidence === 'high' ? '90%' : confidence === 'medium' ? '60%' : '30%';
  return (
    <span className={`text-[10px] font-medium ${colorCls}`} title={`Confidence: ${confidence}`}>
      {pct}
    </span>
  );
}

// =============================================================================
// ResearchLogRow
// =============================================================================

function ResearchLogRow({ entry, large, defaultExpanded = false }: { entry: ResearchLogEntry; large?: boolean; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isFound = entry.status === 'found';
  const textCls = large ? 'text-sm' : 'text-xs';
  const iconCls = large ? 'h-4 w-4' : 'h-3.5 w-3.5';

  return (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
      >
        <ChevronRightIcon className={`${iconCls} text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <span className={`${textCls} font-medium ${
          isFound
            ? 'text-green-700 dark:text-green-400'
            : 'text-gray-500 dark:text-gray-400'
        }`}>
          {isFound ? '✓' : '✗'}
        </span>
        <span className={`${textCls} text-gray-700 dark:text-gray-300 font-medium ${large ? '' : 'truncate'}`}>
          {entry.label}
        </span>
        {entry.strategy && <StrategyBadge strategy={entry.strategy} />}
        {entry.thoroughness && <ThoroughnessBadge thoroughness={entry.thoroughness} />}
        {entry.confidence && <ConfidenceIndicator confidence={entry.confidence} />}
        {isFound && entry.value && !large && (
          <span className={`${textCls} text-gray-500 dark:text-gray-400 truncate ml-auto`}>
            → {entry.value.length > 80 ? entry.value.slice(0, 80) + '...' : entry.value}
          </span>
        )}
        <span className={`${textCls} text-gray-400 dark:text-gray-500 flex-shrink-0`}>
          {entry.steps.length} step{entry.steps.length !== 1 ? 's' : ''}
        </span>
      </button>
      {expanded && (
        <div className="pl-8 pr-3 pb-2 space-y-1.5">
          {isFound && entry.value && (
            <div className={`${textCls} bg-green-50 dark:bg-green-900/20 rounded p-2 mb-2 text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words`}>
              <span className="font-medium text-green-700 dark:text-green-400">Answer: </span>
              {entry.value}
            </div>
          )}
          {entry.steps.map((step, i) => (
            <ResearchStepRow key={i} step={step} large={large} />
          ))}
          {entry.steps.length === 0 && (
            <span className={`${textCls} text-gray-400 italic`}>No research steps recorded</span>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ResearchLog
// =============================================================================

export function ResearchLog({ log, defaultExpanded = false, large }: { log: ResearchLogEntry[]; defaultExpanded?: boolean; large?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const foundCount = log.filter(e => e.status === 'found').length;
  const notFoundCount = log.filter(e => e.status === 'not_found').length;
  const textCls = large ? 'text-sm' : 'text-xs';
  const iconCls = large ? 'h-4 w-4' : 'h-3.5 w-3.5';

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 flex flex-col min-h-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left flex-shrink-0"
      >
        <ChevronRightIcon className={`${iconCls} text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <MagnifyingGlassIcon className={`${iconCls} text-gray-500 flex-shrink-0`} />
        <span className={`${textCls} font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider`}>
          Research Log
        </span>
        <span className={`${textCls} text-gray-400 dark:text-gray-500 ml-auto`}>
          {foundCount} found, {notFoundCount} not found
        </span>
      </button>
      {expanded && (
        <div className={large ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-[400px] overflow-y-auto'}>
          {log.map((entry, i) => (
            <ResearchLogRow key={i} entry={entry} large={large} defaultExpanded={large} />
          ))}
        </div>
      )}
    </div>
  );
}
