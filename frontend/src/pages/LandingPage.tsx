import { Link } from 'react-router-dom';
import {
    CheckCircleIcon,
    XCircleIcon,
    ArrowPathIcon,
    MagnifyingGlassIcon,
    FunnelIcon,
    TableCellsIcon,
} from '@heroicons/react/24/outline';
import PublicTopBar from '../components/layout/PublicTopBar';

// The wrangling loop frames
const wranglingSteps = [
    { who: 'You', text: '"Update the status for leads 4, 7, and 12 to Interview."' },
    { who: 'AI', text: '"Done! Here\'s your updated table."', icon: CheckCircleIcon, iconColor: 'text-green-500' },
    { who: 'You', text: 'You check. Lead 4 updated. Lead 7 updated. Lead 12... still says "Applied."', icon: XCircleIcon, iconColor: 'text-red-500' },
    { who: 'AI', text: '"You\'re right, I apologize! Here\'s the corrected version."', icon: ArrowPathIcon, iconColor: 'text-amber-500' },
    { who: 'You', text: 'Lead 12 is fixed. But lead 15\'s salary changed. And there are only 19 rows now. There were 20.', icon: XCircleIcon, iconColor: 'text-red-500' },
];

const proposalExample = {
    header: 'In TableThat, you see exactly what\'s changing:',
    rows: [
        { name: 'Acme Corp', field: 'Status', from: 'Applied', to: 'Interview', checked: true },
        { name: 'Globex Inc', field: 'Status', from: 'Applied', to: 'Interview', checked: true },
        { name: 'Initech', field: 'Status', from: 'Applied', to: 'Interview', checked: false },
    ],
};

const howItWorks = [
    {
        num: '1',
        title: 'Describe it',
        description: 'Tell AI what you\'re tracking. It designs the schema — column types, select options, structure.',
    },
    {
        num: '2',
        title: 'Populate it',
        description: 'AI researches real data from the web. Real businesses. Real products. You review every row before it\'s added.',
    },
    {
        num: '3',
        title: 'Enrich it',
        description: 'Add a column. AI researches each row individually — per-row, from live sources, not generated from memory.',
    },
];

const differentiators = [
    {
        icon: TableCellsIcon,
        title: 'Every change is a proposal you review',
        description: 'AI shows you exactly which rows are changing, what the old and new values are, with checkboxes on each one. Nothing happens until you click Apply.',
    },
    {
        icon: MagnifyingGlassIcon,
        title: 'Per-row research, not one big guess',
        description: 'When you add a column, AI researches each row individually — searches the web, visits pages, extracts the answer. Not 20 answers generated from memory.',
    },
    {
        icon: FunnelIcon,
        title: 'A real table you come back to',
        description: 'Sort, filter, edit cells, add rows, re-enrich. Your data persists. Come back next week — it\'s all there. No copy-pasting into spreadsheets.',
    },
];

const starterPrompts = [
    'Build me a list of the 10 best Italian restaurants in Chicago',
    'Help me compare project management tools with pricing and features',
    'Track my job applications with status, dates, and follow-up reminders',
    'Find publishers that accept science fiction short stories',
];

export default function LandingPage() {
    return (
        <div className="min-h-screen flex flex-col dark:bg-gray-900 bg-gray-50">
            <PublicTopBar />

            <main className="flex-1 pt-16">
                {/* Hero — the pain */}
                <section className="px-6 pt-20 pb-6 text-center max-w-3xl mx-auto">
                    <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl leading-tight">
                        &ldquo;Here&rsquo;s your updated table.&rdquo;
                        <br />
                        <span className="text-red-500 dark:text-red-400">You check. It&rsquo;s not updated.</span>
                    </h1>
                    <p className="mt-6 text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto leading-relaxed">
                        You&rsquo;ve asked AI to build you a table. Update some rows. Add a column.
                        Every time, it says &ldquo;Done!&rdquo; Every time, you check — and it&rsquo;s not done.
                    </p>
                </section>

                {/* The wrangling loop */}
                <section className="px-6 pb-12 max-w-2xl mx-auto">
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                        {wranglingSteps.map((step, i) => (
                            <div
                                key={i}
                                className={`flex items-start gap-3 px-5 py-4 ${
                                    i < wranglingSteps.length - 1 ? 'border-b border-gray-100 dark:border-gray-700/50' : ''
                                } ${step.who === 'AI' ? 'bg-gray-50 dark:bg-gray-800/50' : ''}`}
                            >
                                <span className={`text-xs font-semibold uppercase tracking-wide mt-0.5 w-8 flex-shrink-0 ${
                                    step.who === 'AI' ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'
                                }`}>
                                    {step.who}
                                </span>
                                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed flex-1">
                                    {step.text}
                                </p>
                                {step.icon && (
                                    <step.icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${step.iconColor}`} />
                                )}
                            </div>
                        ))}
                    </div>

                    <p className="text-center mt-8 text-lg font-semibold text-gray-900 dark:text-white">
                        You&rsquo;re not saving time. You&rsquo;re doing QA on your AI.
                    </p>
                </section>

                {/* The turn — how TableThat handles it */}
                <section className="px-6 py-12 max-w-2xl mx-auto">
                    <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-6">
                        {proposalExample.header}
                    </h2>

                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                        {/* Proposal header */}
                        <div className="px-5 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/30 flex items-center justify-between">
                            <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                                3 updates proposed
                            </span>
                            <div className="flex gap-2">
                                <span className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-md font-medium">
                                    Apply
                                </span>
                                <span className="text-xs px-3 py-1.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md font-medium">
                                    Dismiss
                                </span>
                            </div>
                        </div>

                        {/* Proposal rows */}
                        {proposalExample.rows.map((row, i) => (
                            <div
                                key={i}
                                className={`flex items-center gap-4 px-5 py-3 ${
                                    i < proposalExample.rows.length - 1 ? 'border-b border-gray-100 dark:border-gray-700/50' : ''
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={row.checked}
                                    readOnly
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 pointer-events-none"
                                />
                                <span className="text-sm font-medium text-gray-900 dark:text-white w-28 flex-shrink-0">
                                    {row.name}
                                </span>
                                <span className="text-sm text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">
                                    {row.field}
                                </span>
                                <span className="text-sm text-red-400 line-through">{row.from}</span>
                                <span className="text-sm text-gray-400 dark:text-gray-500">&rarr;</span>
                                <span className="text-sm text-green-600 dark:text-green-400 font-medium">{row.to}</span>
                            </div>
                        ))}
                    </div>

                    <p className="text-center mt-6 text-sm text-gray-500 dark:text-gray-400">
                        Uncheck what you don&rsquo;t want. Edit values before applying. Nothing else changes.
                    </p>
                </section>

                {/* How it works */}
                <section className="px-6 py-16 max-w-4xl mx-auto">
                    <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-14">
                        How it works
                    </h2>
                    <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
                        {howItWorks.map((step) => (
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

                {/* Differentiators */}
                <section className="px-6 py-12 max-w-4xl mx-auto">
                    <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
                        {differentiators.map((d) => (
                            <div
                                key={d.title}
                                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6"
                            >
                                <d.icon className="h-8 w-8 text-blue-600 dark:text-blue-400 mb-4" />
                                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                                    {d.title}
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                                    {d.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Starter prompts */}
                <section className="px-6 py-12 max-w-3xl mx-auto">
                    <h2 className="text-xl font-bold text-center text-gray-900 dark:text-white mb-6">
                        Try one of these
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {starterPrompts.map((prompt) => (
                            <Link
                                key={prompt}
                                to="/register"
                                className="block rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                            >
                                &ldquo;{prompt}&rdquo;
                            </Link>
                        ))}
                    </div>
                </section>

                {/* Bottom CTA */}
                <section className="px-6 py-16 text-center">
                    <div className="max-w-2xl mx-auto rounded-2xl bg-blue-600 dark:bg-blue-700 px-8 py-12">
                        <h2 className="text-3xl font-bold text-white mb-4">
                            Build your first table in 2 minutes
                        </h2>
                        <p className="text-blue-100 mb-8">
                            Free. No credit card. Describe what you need and watch it happen.
                        </p>
                        <Link
                            to="/register"
                            className="inline-block rounded-md bg-white px-6 py-3 text-sm font-semibold text-blue-600 shadow-sm hover:bg-blue-50"
                        >
                            Get Started Free
                        </Link>
                    </div>
                </section>
            </main>
        </div>
    );
}
