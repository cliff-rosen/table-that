import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PublicTopBar from '../components/layout/PublicTopBar';
import { useAuth } from '../context/AuthContext';
import { STARTERS } from '../config/starters';

export default function LandingPage() {
    const [prompt, setPrompt] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { guestLogin } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || isSubmitting) return;

        setIsSubmitting(true);
        try {
            await guestLogin();
            sessionStorage.setItem('guestInitialPrompt', trimmed);
            navigate('/tables');
        } catch {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-[#FAF8F4] dark:bg-gray-900">
            <PublicTopBar transparent />

            <main className="flex-1 flex flex-col items-center px-6 pt-32 pb-16">
                <div className="max-w-3xl w-full text-center space-y-8">
                    {/* Tagline pill */}
                    <div className="inline-block px-5 py-1.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 text-sm font-medium">
                        Stuff to research? Table that.
                    </div>

                    {/* Hero heading */}
                    <h1 className="text-4xl sm:text-5xl font-bold leading-tight text-gray-900 dark:text-white font-serif">
                        Describe what you&rsquo;re researching.{' '}
                        <br className="hidden sm:block" />
                        Get the table, the data,{' '}
                        <br className="hidden sm:block" />
                        and the analysis.
                    </h1>

                    {/* Subtext */}
                    <p className="text-lg text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
                        TableThat figures out the right questions to ask, finds the answers,
                        and helps you make sense of it all.
                    </p>
                </div>

                {/* Input + button */}
                <div className="max-w-2xl w-full mt-12">
                    <div className="flex items-center gap-0 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm overflow-hidden">
                        <input
                            type="text"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSubmit(prompt);
                                }
                            }}
                            placeholder="What are you trying to research or decide?"
                            disabled={isSubmitting}
                            className="flex-1 px-5 py-4 text-base bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none disabled:opacity-50"
                        />
                        <button
                            onClick={() => handleSubmit(prompt)}
                            disabled={!prompt.trim() || isSubmitting}
                            className="flex-shrink-0 px-6 py-4 text-base font-semibold text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border-l border-gray-200 dark:border-gray-600"
                        >
                            {isSubmitting ? 'Creating...' : 'Build my table \u2192'}
                        </button>
                    </div>
                </div>

                {/* Starter cards */}
                <div className="max-w-3xl w-full mt-10">
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center mb-5">
                        Or start with one of these &rarr;
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {STARTERS.map((starter) => (
                            <button
                                key={starter.title}
                                onClick={() => handleSubmit(starter.prompt)}
                                disabled={isSubmitting}
                                className="text-left p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-gray-300 dark:hover:border-gray-500 hover:shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className="text-xs font-medium text-gray-400 dark:text-gray-500 italic">
                                    {starter.category}
                                </span>
                                <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                                    {starter.example}
                                </p>
                            </button>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
