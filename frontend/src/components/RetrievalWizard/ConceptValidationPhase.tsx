import { useState, useEffect } from 'react';
import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { researchStreamApi } from '../../lib/api/researchStreamApi';
import { Concept } from '../../types';

interface ConceptValidationPhaseProps {
    streamId: number;
    concepts: Concept[];
    onValidationReady: (ready: boolean) => void;
}

export default function ConceptValidationPhase({
    streamId,
    concepts,
    onValidationReady
}: ConceptValidationPhaseProps) {
    const [validationResult, setValidationResult] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        validateConcepts();
    }, [concepts]);

    const validateConcepts = async () => {
        try {
            setLoading(true);
            setError(null);

            const result = await researchStreamApi.validateConcepts(streamId, concepts);
            setValidationResult(result);
            onValidationReady(result.ready_to_activate);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Validation failed');
            onValidationReady(false);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    <p className="mt-4 text-gray-600 dark:text-gray-400">Validating configuration...</p>
                </div>
            </div>
        );
    }

    if (error || !validationResult) {
        return (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-red-800 dark:text-red-200">{error || 'Validation failed'}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className={`rounded-lg shadow p-6 ${
                validationResult.ready_to_activate
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                    : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
            }`}>
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                        {validationResult.ready_to_activate ? (
                            <CheckCircleIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
                        ) : (
                            <ExclamationTriangleIcon className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
                        )}
                    </div>
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
                            {validationResult.ready_to_activate
                                ? 'Configuration Ready'
                                : 'Configuration Incomplete'}
                        </h2>
                        <p className={
                            validationResult.ready_to_activate
                                ? 'text-green-800 dark:text-green-200'
                                : 'text-yellow-800 dark:text-yellow-200'
                        }>
                            {validationResult.ready_to_activate
                                ? 'Your retrieval configuration is complete and ready to activate!'
                                : 'Please address the warnings below before activating.'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Coverage Summary */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Topic Coverage
                </h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Coverage Status:</span>
                        <span className={`font-semibold ${
                            validationResult.is_complete
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-yellow-600 dark:text-yellow-400'
                        }`}>
                            {validationResult.coverage.coverage_percentage.toFixed(1)}%
                        </span>
                    </div>

                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                            className={`h-2 rounded-full ${
                                validationResult.is_complete
                                    ? 'bg-green-600'
                                    : 'bg-yellow-600'
                            }`}
                            style={{ width: `${validationResult.coverage.coverage_percentage}%` }}
                        ></div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-gray-600 dark:text-gray-400">Covered Topics:</span>
                            <span className="ml-2 font-medium text-gray-900 dark:text-white">
                                {validationResult.coverage.covered_topics.length}
                            </span>
                        </div>
                        <div>
                            <span className="text-gray-600 dark:text-gray-400">Uncovered Topics:</span>
                            <span className="ml-2 font-medium text-gray-900 dark:text-white">
                                {validationResult.coverage.uncovered_topics.length}
                            </span>
                        </div>
                    </div>

                    {validationResult.coverage.uncovered_topics.length > 0 && (
                        <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                                Uncovered Topics:
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {validationResult.coverage.uncovered_topics.map((topicId: string) => (
                                    <span
                                        key={topicId}
                                        className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200 rounded text-xs"
                                    >
                                        {topicId}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Configuration Status */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Configuration Status
                </h3>
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Total Concepts:</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                            {validationResult.configuration_status.total_concepts}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Concepts with Queries:</span>
                        <span className={`font-medium ${
                            validationResult.configuration_status.concepts_with_queries === validationResult.configuration_status.total_concepts
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-yellow-600 dark:text-yellow-400'
                        }`}>
                            {validationResult.configuration_status.concepts_with_queries} / {validationResult.configuration_status.total_concepts}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Concepts with Filters:</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                            {validationResult.configuration_status.concepts_with_filters}
                            <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">(optional)</span>
                        </span>
                    </div>
                </div>
            </div>

            {/* Warnings */}
            {validationResult.warnings.length > 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-200 mb-4 flex items-center gap-2">
                        <ExclamationTriangleIcon className="h-5 w-5" />
                        Warnings
                    </h3>
                    <ul className="space-y-2">
                        {validationResult.warnings.map((warning: string, index: number) => (
                            <li key={index} className="flex items-start gap-2 text-sm text-yellow-800 dark:text-yellow-200">
                                <span className="flex-shrink-0 mt-0.5">•</span>
                                <span>{warning}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Info */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
                <div className="flex items-start gap-3">
                    <InformationCircleIcon className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-800 dark:text-blue-200">
                        <p className="font-medium mb-2">Ready to finalize?</p>
                        <p>
                            Click "Finalize & Activate" below to save this configuration to your research stream.
                            You can always modify concepts, queries, and filters later from the stream edit page.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
