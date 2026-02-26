import { Link } from 'react-router-dom';
import { ChatBubbleLeftRightIcon, ArrowDownTrayIcon, PencilSquareIcon, SparklesIcon } from '@heroicons/react/24/outline';
import PublicTopBar from '../components/layout/PublicTopBar';

const features = [
    {
        icon: ChatBubbleLeftRightIcon,
        title: 'AI Chat Assistant',
        description: 'Describe what you need in plain English. Our AI builds and modifies your tables through conversation.',
    },
    {
        icon: ArrowDownTrayIcon,
        title: 'Import & Export CSV',
        description: 'Bring in data from spreadsheets or export your tables to CSV with one click.',
    },
    {
        icon: PencilSquareIcon,
        title: 'Inline Editing',
        description: 'Click any cell to edit. Add rows, reorder columns, and manage your data directly in the table.',
    },
    {
        icon: SparklesIcon,
        title: 'Schema Proposals',
        description: 'Let AI suggest the perfect table structure for your data, then refine it to fit your needs.',
    },
];

export default function LandingPage() {
    return (
        <div className="min-h-screen flex flex-col dark:bg-gray-900 bg-gray-50">
            <PublicTopBar />

            <main className="flex-1 pt-16">
                {/* Hero */}
                <section className="px-6 py-24 text-center max-w-4xl mx-auto">
                    <h1 className="text-5xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-6xl">
                        Build smarter tables with AI
                    </h1>
                    <p className="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
                        Create, populate, and manage structured data tables through natural conversation.
                        No spreadsheet skills required.
                    </p>
                    <div className="mt-10 flex items-center justify-center gap-4">
                        <Link
                            to="/register"
                            className="rounded-md bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        >
                            Get Started Free
                        </Link>
                        <Link
                            to="/login"
                            className="text-sm font-semibold text-gray-900 dark:text-gray-200 hover:text-gray-600 dark:hover:text-white"
                        >
                            Already have an account? <span aria-hidden="true">&rarr;</span>
                        </Link>
                    </div>
                </section>

                {/* Features */}
                <section className="px-6 py-16 max-w-6xl mx-auto">
                    <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
                        Everything you need to work with data
                    </h2>
                    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
                        {features.map((feature) => (
                            <div
                                key={feature.title}
                                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6"
                            >
                                <feature.icon className="h-8 w-8 text-blue-600 dark:text-blue-400 mb-4" />
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                    {feature.title}
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-300">
                                    {feature.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Bottom CTA */}
                <section className="px-6 py-20 text-center">
                    <div className="max-w-2xl mx-auto rounded-2xl bg-blue-600 dark:bg-blue-700 px-8 py-12">
                        <h2 className="text-3xl font-bold text-white mb-4">
                            Ready to get started?
                        </h2>
                        <p className="text-blue-100 mb-8">
                            Create your first AI-powered table in seconds.
                        </p>
                        <Link
                            to="/register"
                            className="inline-block rounded-md bg-white px-6 py-3 text-sm font-semibold text-blue-600 shadow-sm hover:bg-blue-50"
                        >
                            Create Free Account
                        </Link>
                    </div>
                </section>
            </main>
        </div>
    );
}
