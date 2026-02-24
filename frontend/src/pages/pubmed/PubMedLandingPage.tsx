import { Link } from 'react-router-dom';
import {
    TableCellsIcon,
    SparklesIcon,
    MagnifyingGlassIcon,
    ArrowsRightLeftIcon,
    ArrowDownTrayIcon,
    CheckCircleIcon
} from '@heroicons/react/24/outline';
import PubMedLayout from '../../components/pubmed/PubMedLayout';

const features = [
    {
        icon: MagnifyingGlassIcon,
        title: 'Smart Search',
        description: 'Search PubMed with powerful query syntax. Filter by date, sort by relevance, and explore results instantly.'
    },
    {
        icon: SparklesIcon,
        title: 'AI-Powered Columns',
        description: 'Add custom AI columns to analyze articles. Ask questions like "Is this a clinical trial?" and get instant answers for every article.'
    },
    {
        icon: ArrowsRightLeftIcon,
        title: 'Compare & Filter',
        description: 'Save search snapshots, compare results, and filter down to exactly what you need. Track your analysis history.'
    },
    {
        icon: ArrowDownTrayIcon,
        title: 'Export Everything',
        description: 'Download your enriched data as CSV. Take your AI-analyzed results anywhere.'
    }
];

const benefits = [
    'No more manual article screening',
    'Analyze hundreds of articles in minutes',
    'Custom AI criteria for your research',
    'Full search history and snapshots',
    'Works with any PubMed query'
];

export default function PubMedLandingPage() {
    return (
        <PubMedLayout>
            {/* Hero Section */}
            <section className="relative overflow-hidden">
                {/* Background gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-purple-50 via-white to-violet-50 dark:from-gray-900 dark:via-gray-900 dark:to-purple-900/20" />

                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
                    <div className="text-center max-w-3xl mx-auto">
                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6">
                            Transform PubMed searches with{' '}
                            <span className="bg-gradient-to-r from-purple-600 to-violet-600 bg-clip-text text-transparent">
                                AI-powered analysis
                            </span>
                        </h1>
                        <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
                            Search, analyze, and enrich PubMed articles with custom AI columns.
                            Screen hundreds of papers in minutes, not hours.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link
                                to="/pubmed/register"
                                className="w-full sm:w-auto px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl shadow-lg shadow-purple-500/25 transition-all hover:shadow-xl hover:shadow-purple-500/30"
                            >
                                Start Analyzing Free
                            </Link>
                            <Link
                                to="/pubmed/login"
                                className="w-full sm:w-auto px-8 py-4 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-semibold rounded-xl border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 transition-colors"
                            >
                                Sign In
                            </Link>
                        </div>
                    </div>

                    {/* Hero visual - stylized table preview */}
                    <div className="mt-16 max-w-5xl mx-auto">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                            {/* Mock toolbar */}
                            <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-4">
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                                    <SparklesIcon className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                    <span className="text-sm font-medium text-purple-700 dark:text-purple-300">Add AI Column</span>
                                </div>
                                <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />
                                <span className="text-sm text-gray-500 dark:text-gray-400">127 articles</span>
                            </div>
                            {/* Mock table */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 dark:bg-gray-900">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">PMID</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Title</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Journal</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-purple-500 uppercase flex items-center gap-1">
                                                <SparklesIcon className="h-3 w-3" />
                                                Clinical Trial?
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">38521234</td>
                                            <td className="px-4 py-3 text-gray-900 dark:text-white">Effects of cognitive training on memory...</td>
                                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">JAMA Neurol</td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300">
                                                    <CheckCircleIcon className="h-3 w-3" />
                                                    Yes
                                                </span>
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">38519876</td>
                                            <td className="px-4 py-3 text-gray-900 dark:text-white">A systematic review of machine learning...</td>
                                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">Nature Med</td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300">
                                                    No
                                                </span>
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">38518901</td>
                                            <td className="px-4 py-3 text-gray-900 dark:text-white">Randomized trial of novel therapeutic...</td>
                                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">Lancet</td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300">
                                                    <CheckCircleIcon className="h-3 w-3" />
                                                    Yes
                                                </span>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="py-20 bg-white dark:bg-gray-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
                            Everything you need to analyze literature
                        </h2>
                        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                            PubMed Tablizer combines powerful search with AI analysis to supercharge your literature review workflow.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                        {features.map((feature) => (
                            <div key={feature.title} className="text-center">
                                <div className="w-14 h-14 bg-purple-100 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                    <feature.icon className="h-7 w-7 text-purple-600 dark:text-purple-400" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                    {feature.title}
                                </h3>
                                <p className="text-gray-600 dark:text-gray-400">
                                    {feature.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Benefits Section */}
            <section className="py-20 bg-gradient-to-br from-purple-600 to-violet-700">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col lg:flex-row items-center gap-12">
                        <div className="flex-1">
                            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
                                Stop drowning in papers
                            </h2>
                            <p className="text-lg text-purple-100 mb-8">
                                Whether you're doing a systematic review, exploring a new research area,
                                or just trying to stay on top of the literature - PubMed Tablizer helps you
                                work smarter, not harder.
                            </p>
                            <ul className="space-y-4">
                                {benefits.map((benefit) => (
                                    <li key={benefit} className="flex items-center gap-3 text-white">
                                        <CheckCircleIcon className="h-6 w-6 text-purple-200 flex-shrink-0" />
                                        {benefit}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="flex-1 flex justify-center">
                            <div className="w-64 h-64 bg-white/10 rounded-3xl flex items-center justify-center">
                                <TableCellsIcon className="h-32 w-32 text-white/50" />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-20 bg-white dark:bg-gray-800">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
                        Ready to transform your literature review?
                    </h2>
                    <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
                        Join researchers who are already using AI to analyze papers faster.
                    </p>
                    <Link
                        to="/pubmed/register"
                        className="inline-flex items-center gap-2 px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl shadow-lg shadow-purple-500/25 transition-all hover:shadow-xl hover:shadow-purple-500/30"
                    >
                        <SparklesIcon className="h-5 w-5" />
                        Get Started Free
                    </Link>
                </div>
            </section>
        </PubMedLayout>
    );
}
