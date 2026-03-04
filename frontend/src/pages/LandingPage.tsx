import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PublicTopBar from '../components/layout/PublicTopBar';
import { useAuth } from '../context/AuthContext';
import { STARTERS } from '../config/starters';

// Pick 4 relatable starters by title
const LANDING_STARTERS = STARTERS.filter(s =>
    ['Competitor Analysis', 'Product Comparison', 'Favorite Restaurants', 'Job Application Tracker'].includes(s.title)
);

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
        <div className="min-h-screen flex flex-col dark:bg-gray-900 bg-gray-50">
            <PublicTopBar />

            <main className="flex-1 flex flex-col items-center justify-center px-6 pt-16">
                <div className="max-w-2xl w-full text-center space-y-8">
                    {/* Pain statement */}
                    <div className="space-y-4">
                        <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl leading-tight">
                            &ldquo;Here&rsquo;s your updated table.&rdquo;
                            <br />
                            <span className="text-red-500 dark:text-red-400">You check. It&rsquo;s not updated.</span>
                        </h1>
                        <p className="text-lg text-gray-500 dark:text-gray-400 max-w-lg mx-auto">
                            You ask AI to build a table. It says &ldquo;Done!&rdquo;
                            It&rsquo;s never done. Rows are missing. Values changed. You&rsquo;re doing QA, not work.
                        </p>
                    </div>

                    {/* Transition */}
                    <p className="text-base text-gray-600 dark:text-gray-300">
                        We could explain how we fix this. Or you could just try it.
                    </p>

                    {/* Describe your table */}
                    <div className="space-y-3">
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit(prompt);
                                }
                            }}
                            placeholder="Describe your table..."
                            rows={3}
                            disabled={isSubmitting}
                            className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:opacity-50"
                        />
                        <button
                            onClick={() => handleSubmit(prompt)}
                            disabled={!prompt.trim() || isSubmitting}
                            className="w-full sm:w-auto px-8 py-3 text-base font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isSubmitting ? 'Creating...' : 'Create Table'}
                        </button>
                    </div>

                    {/* Or choose one of these */}
                    <div className="space-y-2">
                        <p className="text-sm text-gray-400 dark:text-gray-500">or choose one of these</p>
                        <div className="space-y-2 text-left">
                            {LANDING_STARTERS.map((starter) => (
                                <button
                                    key={starter.title}
                                    onClick={() => handleSubmit(starter.prompt)}
                                    disabled={isSubmitting}
                                    className="w-full px-4 py-2.5 text-left text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-300 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400 hover:shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {starter.example}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
