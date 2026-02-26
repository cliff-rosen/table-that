import { Link } from 'react-router-dom';
import {
    SparklesIcon,
    TableCellsIcon,
    BoltIcon,
    ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import PublicTopBar from '../components/layout/PublicTopBar';

const steps = [
    {
        num: '1',
        title: 'Describe it',
        description: 'Tell the AI what you\'re tracking. "Compare SaaS competitors" or "Plan my trip to Italy." It builds the table.',
    },
    {
        num: '2',
        title: 'Populate it',
        description: 'AI fills your rows with real data — research, examples, or structure. You edit from there or let it keep going.',
    },
    {
        num: '3',
        title: 'Put AI to work on it',
        description: 'Add AI-powered columns that analyze, score, summarize, or enrich every row. Your data actually works for you.',
    },
];

const features = [
    {
        icon: SparklesIcon,
        title: 'AI that builds the whole table',
        description: 'Describe what you need. AI designs the schema, populates the rows, and gets you to a working table in one conversation.',
    },
    {
        icon: BoltIcon,
        title: 'Row-by-row AI processing',
        description: 'Add a column and let AI process every row — scoring, categorizing, summarizing, enriching. Like having a research assistant for each cell.',
    },
    {
        icon: TableCellsIcon,
        title: 'Structure without the fight',
        description: 'Stop wrestling with spreadsheets. Say what you\'re organizing, get a clean table with the right columns, types, and constraints.',
    },
    {
        icon: ArrowDownTrayIcon,
        title: 'Import, export, keep moving',
        description: 'Bring in CSV data, export when you need to. Your data is never locked in.',
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
                        Tell AI what you're tracking.
                        <br />
                        <span className="text-blue-600 dark:text-blue-400">Get a table that works.</span>
                    </h1>
                    <p className="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
                        table.that turns a plain-English description into a structured, populated table —
                        then lets you unleash AI on every row to analyze, enrich, and score your data.
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

                {/* How it works */}
                <section className="px-6 py-16 max-w-4xl mx-auto">
                    <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-14">
                        Three steps. No spreadsheet wrestling.
                    </h2>
                    <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
                        {steps.map((step) => (
                            <div key={step.num} className="text-center">
                                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-lg font-bold mb-4">
                                    {step.num}
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                    {step.title}
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                                    {step.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Features */}
                <section className="px-6 py-16 max-w-6xl mx-auto">
                    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                        {features.map((feature) => (
                            <div
                                key={feature.title}
                                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6"
                            >
                                <feature.icon className="h-8 w-8 text-blue-600 dark:text-blue-400 mb-4" />
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                    {feature.title}
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
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
                            Stop organizing. Start deciding.
                        </h2>
                        <p className="text-blue-100 mb-8">
                            Build your first AI-powered table in under a minute.
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
