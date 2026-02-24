import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface PubMedWorkbenchHelpProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function PubMedWorkbenchHelp({ isOpen, onClose }: PubMedWorkbenchHelpProps) {
    const [activeTab, setActiveTab] = useState<'basics' | 'use-cases'>('basics');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">PubMed Tablizer Help</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    >
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="border-b border-gray-200 dark:border-gray-700">
                    <nav className="flex">
                        <button
                            onClick={() => setActiveTab('basics')}
                            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'basics'
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                        >
                            Basics
                        </button>
                        <button
                            onClick={() => setActiveTab('use-cases')}
                            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'use-cases'
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                        >
                            Use Cases
                        </button>
                    </nav>
                </div>

                <div className="p-6 overflow-y-auto space-y-6">
                    {activeTab === 'basics' && <BasicsContent />}
                    {activeTab === 'use-cases' && <UseCasesContent />}
                </div>
            </div>
        </div>
    );
}

function BasicsContent() {
    return (
        <>
            <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">What is PubMed Tablizer?</h3>
                <p className="text-gray-600 dark:text-gray-400">
                    PubMed Tablizer is a powerful alternative to searching directly on PubMed. It lets you search, filter, and enrich PubMed articles with AI-generated columns - all in one place.
                </p>
            </div>

            <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Getting Started</h3>
                <ol className="list-decimal list-inside space-y-2 text-gray-600 dark:text-gray-400">
                    <li><strong>Search:</strong> Enter a PubMed query (same syntax as PubMed). Use the date buttons or leave dates empty for all time.</li>
                    <li><strong>View Results:</strong> Click any row to open the full article viewer with abstract, links, and AI analysis.</li>
                    <li><strong>Add AI Columns:</strong> Click "Add AI Column" to create custom columns powered by AI (e.g., "Is this a clinical trial?" or "Extract sample size").</li>
                </ol>
            </div>

            <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">AI Column Types</h3>
                <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                    <li><strong>Boolean (Yes/No):</strong> Great for filtering. Ask questions like "Does this study involve human subjects?" Then filter by Yes/No.</li>
                    <li><strong>Text:</strong> Extract information like study design, population, or key findings.</li>
                    <li><strong>Number:</strong> Extract numeric values like sample size or follow-up duration.</li>
                </ul>
            </div>

            <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Filtering & Saving</h3>
                <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                    <li><strong>Text Filter:</strong> Type in the search box to filter across all visible columns.</li>
                    <li><strong>Boolean Filters:</strong> Click Yes/No/All to filter AI boolean columns.</li>
                    <li><strong>Save to History:</strong> After filtering, save your filtered set to history for later comparison.</li>
                </ul>
            </div>

            <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">History & Compare</h3>
                <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                    <li><strong>Search History:</strong> Every search is saved. Click to view past results.</li>
                    <li><strong>Compare Mode:</strong> Select two search results to see what's common vs. unique to each.</li>
                    <li><strong>Provenance:</strong> Filtered and compared sets show where they came from (e.g., "filtered from #1").</li>
                </ul>
            </div>

            <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Tips</h3>
                <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                    <li>Initial search fetches 20 articles quickly. When you add an AI column, it automatically fetches up to 500 for processing.</li>
                    <li>Use boolean AI columns to quickly identify relevant articles, then save that filtered set.</li>
                    <li>Export your table to CSV for use in other tools.</li>
                </ul>
            </div>
        </>
    );
}

function UseCasesContent() {
    return (
        <>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
                    Finding False Negatives in Your Search Query
                </h3>
                <p className="text-blue-800 dark:text-blue-200 text-sm">
                    How to validate whether a broader query captures truly relevant articles that a narrower query missed.
                </p>
            </div>

            <div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">The Problem</h4>
                <p className="text-gray-600 dark:text-gray-400">
                    You have a PubMed query (Query A) that returns 100 results, but you suspect it may be missing relevant articles (false negatives). You broaden the query (Query B) and now get 150 results. But are those extra 50 articles actually relevant, or just noise?
                </p>
            </div>

            <div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">The Workflow</h4>
                <ol className="space-y-4">
                    <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">1</span>
                        <div>
                            <p className="font-medium text-gray-900 dark:text-white">Run your original query (Query A)</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">This is your baseline - the results you're confident about.</p>
                        </div>
                    </li>
                    <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">2</span>
                        <div>
                            <p className="font-medium text-gray-900 dark:text-white">Run your expanded query (Query B)</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">A broader query that should capture articles Query A might have missed.</p>
                        </div>
                    </li>
                    <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">3</span>
                        <div>
                            <p className="font-medium text-gray-900 dark:text-white">Use Compare Mode</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Click "Compare Searches" and select Query A and Query B. This shows you what's in A only, what's in both, and what's in B only.</p>
                        </div>
                    </li>
                    <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">4</span>
                        <div>
                            <p className="font-medium text-gray-900 dark:text-white">Save "Only in B" to History</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Click the "Only in B" tab to see the 50 extra articles, then click "Save to History" to create a snapshot of just these articles.</p>
                        </div>
                    </li>
                    <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">5</span>
                        <div>
                            <p className="font-medium text-gray-900 dark:text-white">View the "Only in B" snapshot and add an AI column</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Click on your saved snapshot to view it in the table. Then add a boolean AI column with a prompt like: <em>"Is this article relevant to [your research topic]?"</em></p>
                        </div>
                    </li>
                    <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">6</span>
                        <div>
                            <p className="font-medium text-gray-900 dark:text-white">Filter by "Yes" to find the relevant ones</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Use the quick filter to show only articles marked "Yes". These are your confirmed false negatives - relevant articles that Query A missed!</p>
                        </div>
                    </li>
                </ol>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Why This Works</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    By isolating only the articles unique to Query B, you avoid re-reviewing articles you've already seen. The AI semantic filter then quickly triages which of those extra articles are actually relevant to your research question - saving hours of manual review.
                </p>
            </div>
        </>
    );
}
