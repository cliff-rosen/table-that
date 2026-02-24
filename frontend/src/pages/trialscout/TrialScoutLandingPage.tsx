import { Link } from 'react-router-dom';
import {
    BeakerIcon,
    MagnifyingGlassIcon,
    SparklesIcon,
    ArrowDownTrayIcon,
    AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline';

export default function TrialScoutLandingPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-50 to-violet-100 dark:from-gray-900 dark:to-gray-800">
            {/* Header */}
            <header className="container mx-auto px-6 py-6">
                <nav className="flex items-center justify-between">
                    <Link to="/trialscout" className="flex items-center gap-2">
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl flex items-center justify-center">
                            <BeakerIcon className="h-6 w-6 text-white" />
                        </div>
                        <span className="text-xl font-bold bg-gradient-to-r from-purple-600 to-violet-600 bg-clip-text text-transparent">
                            TrialScout
                        </span>
                    </Link>
                    <div className="flex items-center gap-4">
                        <Link
                            to="/trialscout/login"
                            className="text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 font-medium"
                        >
                            Sign In
                        </Link>
                        <Link
                            to="/trialscout/register"
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
                        >
                            Get Started
                        </Link>
                    </div>
                </nav>
            </header>

            {/* Hero */}
            <section className="container mx-auto px-6 py-20 text-center">
                <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
                    Explore the clinical trial
                    <br />
                    <span className="bg-gradient-to-r from-purple-600 to-violet-600 bg-clip-text text-transparent">
                        landscape with AI
                    </span>
                </h1>
                <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto mb-10">
                    Search ClinicalTrials.gov with powerful filters. Analyze trial designs,
                    compare endpoints, and identify competitive gaps—all in one place.
                </p>
                <div className="flex items-center justify-center gap-4">
                    <Link
                        to="/trialscout/register"
                        className="px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors text-lg"
                    >
                        Start Exploring Free
                    </Link>
                    <Link
                        to="/trialscout/login"
                        className="px-8 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium rounded-lg transition-colors text-lg"
                    >
                        Sign In
                    </Link>
                </div>
            </section>

            {/* Features */}
            <section className="container mx-auto px-6 py-20">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-12">
                    Powerful trial intelligence, simplified
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                    <FeatureCard
                        icon={<MagnifyingGlassIcon className="h-8 w-8" />}
                        title="Smart Search"
                        description="Search by condition, intervention, sponsor, phase, and status. Find relevant trials in seconds."
                    />
                    <FeatureCard
                        icon={<AdjustmentsHorizontalIcon className="h-8 w-8" />}
                        title="Powerful Filters"
                        description="Filter by recruitment status, study phase, location, and more to find exactly what you need."
                    />
                    <FeatureCard
                        icon={<SparklesIcon className="h-8 w-8" />}
                        title="AI Analysis"
                        description="Add AI-powered columns to extract endpoints, mechanisms, and custom insights from trial data."
                    />
                    <FeatureCard
                        icon={<ArrowDownTrayIcon className="h-8 w-8" />}
                        title="Export & Share"
                        description="Download your results as CSV for further analysis or sharing with your team."
                    />
                </div>
            </section>

            {/* Use Cases */}
            <section className="container mx-auto px-6 py-20 bg-white/50 dark:bg-gray-800/50 rounded-3xl mx-4">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-12">
                    Built for researchers
                </h2>
                <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
                    <UseCaseCard
                        title="Competitive Intelligence"
                        description="Track what competitors are studying. Identify gaps in the trial landscape for your therapeutic area."
                    />
                    <UseCaseCard
                        title="Study Design"
                        description="Benchmark trial designs. See what endpoints, enrollment targets, and durations are standard."
                    />
                    <UseCaseCard
                        title="Due Diligence"
                        description="Quickly assess the competitive landscape when evaluating potential investments or partnerships."
                    />
                </div>
            </section>

            {/* CTA */}
            <section className="container mx-auto px-6 py-20 text-center">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
                    Ready to explore?
                </h2>
                <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
                    Start searching clinical trials with AI-powered analysis today.
                </p>
                <Link
                    to="/trialscout/register"
                    className="inline-block px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors text-lg"
                >
                    Get Started Free
                </Link>
            </section>

            {/* Footer */}
            <footer className="container mx-auto px-6 py-8 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <BeakerIcon className="h-5 w-5 text-purple-600" />
                        <span className="text-gray-600 dark:text-gray-400">TrialScout</span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Data from ClinicalTrials.gov
                    </p>
                </div>
            </footer>
        </div>
    );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
            <div className="w-14 h-14 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-xl flex items-center justify-center mb-4">
                {icon}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
            <p className="text-gray-600 dark:text-gray-400">{description}</p>
        </div>
    );
}

function UseCaseCard({ title, description }: { title: string; description: string }) {
    return (
        <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
            <p className="text-gray-600 dark:text-gray-400">{description}</p>
        </div>
    );
}
