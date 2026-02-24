import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { ReportArticle } from '../../types';
import { CardFormat } from './ReportHeader';
import { formatArticleDate } from '../../utils/dateUtils';
import StarButton from '../articles/StarButton';

export interface ReportArticleCardProps {
    article: ReportArticle;
    cardFormat?: CardFormat;
    onClick?: () => void;
    isStarred?: boolean;
    onToggleStar?: () => void;
}

export default function ReportArticleCard({
    article,
    cardFormat = 'compact',
    onClick,
    isStarred = false,
    onToggleStar
}: ReportArticleCardProps) {
    return (
        <div
            onClick={onClick}
            className={`border border-gray-200 dark:border-gray-700 rounded-lg p-4 transition-all ${
                onClick
                    ? 'cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
        >
            <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-blue-600 dark:text-blue-400 mb-1 group-hover:underline">
                        {article.title}
                    </h4>
                    {article.authors && article.authors.length > 0 && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                            {article.authors.slice(0, 3).join(', ')}
                            {article.authors.length > 3 && ` et al.`}
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-500">
                        {article.journal && <span>{article.journal}</span>}
                        {article.pub_year && (
                            <span>• {formatArticleDate(article.pub_year, article.pub_month, article.pub_day)}</span>
                        )}
                        {article.pmid && <span>• PMID: {article.pmid}</span>}
                    </div>
                    {cardFormat === 'ai_summary' && article.ai_summary && (
                        <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-md border-l-2 border-purple-400 dark:border-purple-600">
                            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                {article.ai_summary}
                            </p>
                        </div>
                    )}
                    {cardFormat === 'ai_summary' && !article.ai_summary && article.abstract && (
                        <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 italic">No AI summary available - showing abstract</p>
                            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                {article.abstract}
                            </p>
                        </div>
                    )}
                    {cardFormat === 'abstract' && article.abstract && (
                        <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                {article.abstract}
                            </p>
                        </div>
                    )}
                    {article.relevance_rationale && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 italic">
                            {article.relevance_rationale}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 mt-1">
                    {onToggleStar && (
                        <StarButton
                            isStarred={isStarred}
                            onToggle={onToggleStar}
                            size="sm"
                        />
                    )}
                    {onClick && (
                        <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                    )}
                </div>
            </div>
        </div>
    );
}
