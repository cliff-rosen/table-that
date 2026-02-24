import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HelpCircle, X } from 'lucide-react';

interface Subsection {
    id: string;
    title: string;
    content: React.ReactNode;
}

interface Section {
    id: string;
    title: string;
    content?: React.ReactNode;
    subsections?: Subsection[];
}

const sections: Section[] = [
    {
        id: 'overview',
        title: 'Overview',
        content: (
            <div className="space-y-6">
                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">What is Knowledge Horizon?</h4>
                    <p className="text-gray-700 dark:text-gray-300 mb-3">
                        Knowledge Horizon is an intelligent research monitoring platform designed for biomedical and business intelligence professionals. It automatically tracks developments in your field and delivers curated insights through AI-powered research streams.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                        <li><strong>Automated Monitoring:</strong> Continuously tracks research across PubMed, Google Scholar, and other academic sources</li>
                        <li><strong>AI Curation:</strong> Uses advanced AI to filter and rank articles by relevance to your specific interests</li>
                        <li><strong>Periodic Reports:</strong> Delivers digestible summaries on your schedule (daily, weekly, biweekly, or monthly)</li>
                        <li><strong>Competitive Intelligence:</strong> Monitors specific companies, therapeutic areas, and market developments</li>
                    </ul>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Key Features</h4>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                        <li><strong>Research Streams:</strong> Create custom monitoring channels for different topics, competitors, or therapeutic areas</li>
                        <li><strong>Smart Reports:</strong> Receive AI-curated summaries with key highlights, thematic analysis, and ranked articles</li>
                        <li><strong>AI-Guided Setup:</strong> Natural conversation interface helps you create research streams quickly</li>
                        <li><strong>Profile-Based Personalization:</strong> Your organization profile ensures relevant, focused results</li>
                    </ul>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Who It's For</h4>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                        <li><strong>Biotech & Pharma:</strong> Track competitor pipelines, clinical trials, and therapeutic developments</li>
                        <li><strong>Medical Affairs:</strong> Monitor emerging evidence, treatment guidelines, and clinical research</li>
                        <li><strong>Business Intelligence:</strong> Stay informed on market trends, regulatory changes, and industry news</li>
                        <li><strong>Research Teams:</strong> Keep pace with scientific literature in your domain</li>
                    </ul>
                </div>
            </div>
        )
    },
    {
        id: 'getting-started',
        title: 'Getting Started',
        subsections: [
            {
                id: 'setup-profile',
                title: '1. Complete Your Profile',
                content: (
                    <div className="space-y-6">
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
                            <p className="text-blue-800 dark:text-blue-200 mb-3">
                                Before creating research streams, you'll need to complete your organization profile. This ensures personalized, relevant results.
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-blue-700 dark:text-blue-300">
                                <li><strong>Company Name:</strong> Your organization's name</li>
                                <li><strong>Industry Focus:</strong> Primary industry or sector</li>
                                <li><strong>Therapeutic Areas:</strong> Main areas of interest</li>
                                <li><strong>Research Interests:</strong> Specific topics you want to monitor</li>
                            </ul>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                            <p className="text-gray-700 dark:text-gray-300">
                                Navigate to <strong>Settings → Profile</strong> to complete your profile information.
                            </p>
                        </div>
                    </div>
                )
            },
            {
                id: 'create-stream',
                title: '2. Create a Research Stream',
                content: (
                    <div className="space-y-6">
                        <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-lg border border-green-200 dark:border-green-800">
                            <h5 className="font-semibold text-green-900 dark:text-green-100 mb-3">Two Ways to Create Streams</h5>
                            <div className="space-y-4">
                                <div>
                                    <strong className="text-green-800 dark:text-green-200">AI-Guided Interview (Recommended):</strong>
                                    <p className="text-green-700 dark:text-green-300 text-sm mt-1">
                                        Have a conversation with our AI assistant. It will ask questions about your needs and help you build the stream configuration step-by-step.
                                    </p>
                                </div>
                                <div>
                                    <strong className="text-green-800 dark:text-green-200">Manual Form:</strong>
                                    <p className="text-green-700 dark:text-green-300 text-sm mt-1">
                                        If you know exactly what you want, fill out the traditional form directly.
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                            <h5 className="font-semibold text-gray-900 dark:text-white mb-3">What You'll Need to Define</h5>
                            <ul className="list-disc pl-6 space-y-1 text-gray-700 dark:text-gray-300">
                                <li>Stream name and description</li>
                                <li>Stream type (competitive, clinical, regulatory, etc.)</li>
                                <li>Focus areas or therapeutic areas</li>
                                <li>Competitors to monitor (optional)</li>
                                <li>Report frequency (daily, weekly, biweekly, monthly)</li>
                            </ul>
                        </div>
                    </div>
                )
            },
            {
                id: 'review-reports',
                title: '3. Review Your Reports',
                content: (
                    <div className="space-y-6">
                        <div className="bg-purple-50 dark:bg-purple-900/20 p-6 rounded-lg border border-purple-200 dark:border-purple-800">
                            <p className="text-purple-800 dark:text-purple-200 mb-3">
                                Reports are generated automatically based on your stream's frequency settings. Each report includes:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-purple-700 dark:text-purple-300">
                                <li><strong>Executive Summary:</strong> High-level overview of key developments</li>
                                <li><strong>Key Highlights:</strong> Most important findings and insights</li>
                                <li><strong>Thematic Analysis:</strong> Organized by topic or trend</li>
                                <li><strong>Curated Articles:</strong> Ranked by relevance with AI summaries</li>
                            </ul>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                            <p className="text-gray-700 dark:text-gray-300">
                                Access reports from the <strong>Reports</strong> page. Select a research stream to see all its reports, then click on a specific report to view the full details.
                            </p>
                        </div>
                    </div>
                )
            }
        ]
    },
    {
        id: 'understanding-streams',
        title: 'Understanding Streams',
        content: (
            <div className="space-y-6">
                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Stream Types</h4>
                    <div className="space-y-3">
                        <div>
                            <strong className="text-gray-800 dark:text-gray-200">Competitive:</strong>
                            <p className="text-gray-700 dark:text-gray-300 text-sm">Monitor specific competitors' publications, patents, clinical trials, and announcements.</p>
                        </div>
                        <div>
                            <strong className="text-gray-800 dark:text-gray-200">Regulatory:</strong>
                            <p className="text-gray-700 dark:text-gray-300 text-sm">Track FDA approvals, regulatory guidelines, and compliance developments.</p>
                        </div>
                        <div>
                            <strong className="text-gray-800 dark:text-gray-200">Clinical:</strong>
                            <p className="text-gray-700 dark:text-gray-300 text-sm">Follow clinical trial results, protocols, and patient outcomes.</p>
                        </div>
                        <div>
                            <strong className="text-gray-800 dark:text-gray-200">Market:</strong>
                            <p className="text-gray-700 dark:text-gray-300 text-sm">Monitor market trends, mergers & acquisitions, and business developments.</p>
                        </div>
                        <div>
                            <strong className="text-gray-800 dark:text-gray-200">Scientific:</strong>
                            <p className="text-gray-700 dark:text-gray-300 text-sm">Track basic research, scientific discoveries, and mechanistic studies.</p>
                        </div>
                        <div>
                            <strong className="text-gray-800 dark:text-gray-200">Mixed:</strong>
                            <p className="text-gray-700 dark:text-gray-300 text-sm">Combination of multiple focus areas for comprehensive monitoring.</p>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Report Frequencies</h4>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                        <li><strong>Daily:</strong> High-velocity monitoring for rapidly evolving areas</li>
                        <li><strong>Weekly:</strong> Balanced frequency for most use cases</li>
                        <li><strong>Biweekly:</strong> Moderate monitoring with digestible summaries</li>
                        <li><strong>Monthly:</strong> Comprehensive overview for slower-moving fields</li>
                    </ul>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Managing Streams</h4>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                        <li><strong>Pause/Resume:</strong> Temporarily stop monitoring without deleting the stream</li>
                        <li><strong>Edit:</strong> Update focus areas, competitors, or frequency</li>
                        <li><strong>Delete:</strong> Permanently remove a stream and its reports</li>
                        <li><strong>View History:</strong> Access all past reports for trend analysis</li>
                    </ul>
                </div>
            </div>
        )
    },
    {
        id: 'reports',
        title: 'Working with Reports',
        content: (
            <div className="space-y-6">
                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Report Structure</h4>
                    <div className="space-y-3">
                        <div>
                            <strong className="text-gray-800 dark:text-gray-200">Executive Summary:</strong>
                            <p className="text-gray-700 dark:text-gray-300 text-sm">High-level overview of the most important developments in the reporting period.</p>
                        </div>
                        <div>
                            <strong className="text-gray-800 dark:text-gray-200">Key Highlights:</strong>
                            <p className="text-gray-700 dark:text-gray-300 text-sm">Bullet-point summary of critical findings and noteworthy articles.</p>
                        </div>
                        <div>
                            <strong className="text-gray-800 dark:text-gray-200">Thematic Analysis:</strong>
                            <p className="text-gray-700 dark:text-gray-300 text-sm">Articles organized by common themes and trends identified by AI.</p>
                        </div>
                        <div>
                            <strong className="text-gray-800 dark:text-gray-200">Article List:</strong>
                            <p className="text-gray-700 dark:text-gray-300 text-sm">Complete list of articles ranked by relevance with metadata and summaries.</p>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Article Information</h4>
                    <p className="text-gray-700 dark:text-gray-300 mb-3">Each article in a report includes:</p>
                    <ul className="list-disc pl-6 space-y-1 text-gray-700 dark:text-gray-300">
                        <li>Title, authors, and publication information</li>
                        <li>Abstract or summary</li>
                        <li>Relevance score and ranking</li>
                        <li>AI-generated rationale for inclusion</li>
                        <li>Links to original source (PubMed, DOI, etc.)</li>
                        <li>Star/bookmark capability for future reference</li>
                    </ul>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Report Navigation</h4>
                    <p className="text-gray-700 dark:text-gray-300 mb-3">
                        The Reports page shows all your streams on the left and report details on the right. Select a stream to see its report history, then click on a specific report to view the full content.
                    </p>
                </div>
            </div>
        )
    },
    {
        id: 'tips',
        title: 'Tips & Best Practices',
        content: (
            <div className="space-y-6">
                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Creating Effective Streams</h4>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                        <li><strong>Be Specific:</strong> Narrower focus areas yield more relevant results</li>
                        <li><strong>Use Multiple Streams:</strong> Create separate streams for different topics rather than one broad stream</li>
                        <li><strong>Set Appropriate Frequency:</strong> Match frequency to how quickly your field evolves</li>
                        <li><strong>Review and Refine:</strong> Adjust focus areas based on initial report quality</li>
                    </ul>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Getting the Most Value</h4>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
                        <li><strong>Review Regularly:</strong> Check reports on schedule to stay current</li>
                        <li><strong>Star Important Articles:</strong> Bookmark key findings for easy reference</li>
                        <li><strong>Share with Team:</strong> Export reports or share specific articles</li>
                        <li><strong>Track Trends:</strong> Review report history to identify patterns over time</li>
                    </ul>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Common Use Cases</h4>
                    <div className="space-y-3">
                        <div>
                            <strong className="text-gray-800 dark:text-gray-200">Competitive Intelligence:</strong>
                            <p className="text-gray-700 dark:text-gray-300 text-sm">Create a competitive stream with 3-5 key competitors in your therapeutic area</p>
                        </div>
                        <div>
                            <strong className="text-gray-800 dark:text-gray-200">Therapeutic Monitoring:</strong>
                            <p className="text-gray-700 dark:text-gray-300 text-sm">Set up a clinical or scientific stream for each therapeutic area of interest</p>
                        </div>
                        <div>
                            <strong className="text-gray-800 dark:text-gray-200">Market Surveillance:</strong>
                            <p className="text-gray-700 dark:text-gray-300 text-sm">Use a market stream to track M&A, partnerships, and business developments</p>
                        </div>
                    </div>
                </div>
            </div>
        )
    }
];

export const HelpGuide: React.FC = () => {
    const [activeSection, setActiveSection] = useState<string>('overview');
    const [activeSubsection, setActiveSubsection] = useState<string | null>(null);

    const renderNavigation = () => {
        return (
            <nav className="p-4 space-y-1">
                {sections.map(section => (
                    <div key={section.id}>
                        <button
                            onClick={() => {
                                setActiveSection(section.id);
                                setActiveSubsection(null);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors
                                      ${activeSection === section.id && !activeSubsection
                                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-700/50'
                                }`}
                        >
                            {section.title}
                        </button>
                        {section.id === 'getting-started' && section.subsections && (
                            <div className="pl-4 mt-1 space-y-1">
                                {section.subsections.map(subsection => (
                                    <button
                                        key={subsection.id}
                                        onClick={() => {
                                            setActiveSection(section.id);
                                            setActiveSubsection(subsection.id);
                                        }}
                                        className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors
                                                  ${activeSubsection === subsection.id
                                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-700/50'
                                            }`}
                                    >
                                        {subsection.title}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </nav>
        );
    };

    const renderContent = () => {
        const section = sections.find(s => s.id === activeSection);
        if (!section) return null;

        if (section.id === 'getting-started' && activeSubsection) {
            const subsection = section.subsections?.find(s => s.id === activeSubsection);
            return subsection?.content;
        }

        return section.content;
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="inline-flex items-center justify-center rounded-md w-8 h-8
                             text-gray-400 hover:text-gray-500 hover:bg-gray-100
                             dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800
                             focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
                             transition-colors"
                    aria-label="Help"
                >
                    <HelpCircle className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-6xl h-[80vh] flex flex-col">
                <DialogClose asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-4 top-4
                                 inline-flex items-center justify-center rounded-md w-8 h-8
                                 text-gray-400 hover:text-gray-500 hover:bg-gray-100
                                 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800
                                 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
                                 transition-colors"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </DialogClose>
                <DialogHeader className="border-b border-gray-200 dark:border-gray-700 pb-4">
                    <DialogTitle className="text-2xl font-bold text-gray-900 dark:text-white">Knowledge Horizon Help</DialogTitle>
                </DialogHeader>

                <div className="flex-1 flex overflow-hidden">
                    {/* Left Navigation */}
                    <div className="w-56 border-r border-gray-200 dark:border-gray-700 overflow-y-auto bg-gray-50 dark:bg-gray-800/50">
                        {renderNavigation()}
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-800">
                        <div className="max-w-4xl mx-auto p-8">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                                {activeSubsection
                                    ? sections.find(s => s.id === activeSection)?.subsections?.find(s => s.id === activeSubsection)?.title
                                    : sections.find(s => s.id === activeSection)?.title}
                            </h2>
                            <div className="prose dark:prose-invert max-w-none">
                                {renderContent()}
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
