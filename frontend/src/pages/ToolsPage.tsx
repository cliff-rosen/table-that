import { useState } from 'react';
import { WrenchScrewdriverIcon, MagnifyingGlassIcon, DocumentTextIcon, DocumentMagnifyingGlassIcon, TableCellsIcon } from '@heroicons/react/24/outline';
import PubMedIdChecker from '../components/tools/PubMedIdChecker';
import PubMedSearch from '../components/tools/PubMedSearch';
import { DocumentAnalysis } from '../components/tools/DocumentAnalysis';
import PubMedWorkbench from '../components/pubmed/PubMedWorkbench';

type ToolTab = 'search' | 'id-checker' | 'document-analysis' | 'tablizer';

const tabs: { id: ToolTab; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
    {
        id: 'search',
        label: 'PubMed Search',
        description: 'Search PubMed with custom queries and date filters',
        icon: DocumentTextIcon,
    },
    {
        id: 'id-checker',
        label: 'PubMed ID Checker',
        description: 'Test which PubMed IDs are captured by a search query',
        icon: MagnifyingGlassIcon,
    },
    {
        id: 'document-analysis',
        label: 'Document Analysis',
        description: 'AI-powered document summarization and extraction',
        icon: DocumentMagnifyingGlassIcon,
    },
    {
        id: 'tablizer',
        label: 'Tablizer',
        description: 'AI-powered table enrichment with generated columns',
        icon: TableCellsIcon,
    },
];

export default function ToolsPage() {
    const [activeTab, setActiveTab] = useState<ToolTab>('search');

    // Use full width for Tablizer, constrained for other tools
    const containerClass = activeTab === 'tablizer'
        ? 'px-4 sm:px-6 lg:px-8 py-6'
        : 'max-w-7xl mx-auto px-4 py-8';

    return (
        <div className={containerClass}>
            {/* Page Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <WrenchScrewdriverIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Tools
                    </h1>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                    Utilities for testing and analyzing search queries
                </p>
            </div>

            {/* Tab Navigation */}
            <div className="mb-6">
                <div className="border-b border-gray-200 dark:border-gray-700">
                    <nav className="-mb-px flex space-x-8">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`
                                        group inline-flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm
                                        ${isActive
                                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                        }
                                    `}
                                >
                                    <Icon className={`h-5 w-5 ${isActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300'}`} />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>
            </div>

            {/* Active Tool */}
            <div>
                {activeTab === 'search' && <PubMedSearch />}
                {activeTab === 'id-checker' && <PubMedIdChecker />}
                {activeTab === 'document-analysis' && <DocumentAnalysis />}
                {activeTab === 'tablizer' && <PubMedWorkbench />}
            </div>
        </div>
    );
}
