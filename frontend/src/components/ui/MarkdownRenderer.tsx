import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
    content: string;
    className?: string;
    compact?: boolean;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '', compact = false }) => {
    return (
        <div className={`prose prose-gray dark:prose-invert max-w-none ${className}`}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    // Text elements
                    p: ({ children }) => (
                        <p className={`text-gray-900 dark:text-gray-100 ${compact ? 'mb-1' : 'mb-4'}`}>
                            {children}
                        </p>
                    ),
                    h1: ({ children }) => (
                        <h1 className={`text-2xl font-bold text-gray-900 dark:text-gray-100 ${compact ? 'mb-2' : 'mb-4'}`}>
                            {children}
                        </h1>
                    ),
                    h2: ({ children }) => (
                        <h2 className={`text-xl font-bold text-gray-900 dark:text-gray-100 ${compact ? 'mb-2' : 'mb-3'}`}>
                            {children}
                        </h2>
                    ),
                    h3: ({ children }) => (
                        <h3 className={`text-lg font-bold text-gray-900 dark:text-gray-100 ${compact ? 'mb-1' : 'mb-2'}`}>
                            {children}
                        </h3>
                    ),

                    // Lists
                    ul: ({ children }) => (
                        <ul className={`list-disc list-inside space-y-1 text-gray-900 dark:text-gray-100 ${compact ? 'mb-2' : 'mb-4'}`}>
                            {children}
                        </ul>
                    ),
                    ol: ({ children }) => (
                        <ol className={`list-decimal list-inside space-y-1 text-gray-900 dark:text-gray-100 ${compact ? 'mb-2' : 'mb-4'}`}>
                            {children}
                        </ol>
                    ),
                    li: ({ children }) => (
                        <li className="text-gray-900 dark:text-gray-100">
                            {children}
                        </li>
                    ),

                    // Table elements
                    table: props => (
                        <table className="min-w-full border-collapse border border-gray-200 dark:border-gray-700">
                            {props.children}
                        </table>
                    ),
                    thead: props => (
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            {props.children}
                        </thead>
                    ),
                    tbody: props => (
                        <tbody className="bg-white dark:bg-gray-900">
                            {props.children}
                        </tbody>
                    ),
                    tr: props => (
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                            {props.children}
                        </tr>
                    ),
                    th: props => (
                        <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700 last:border-r-0">
                            {props.children}
                        </th>
                    ),
                    td: props => (
                        <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700 last:border-r-0">
                            {props.children}
                        </td>
                    ),

                    // Code elements
                    code: props => (
                        <code className="bg-gray-100 dark:bg-gray-800 rounded px-1 py-0.5 text-sm font-mono text-gray-900 dark:text-gray-100">
                            {props.children}
                        </code>
                    ),
                    pre: props => (
                        <pre className="bg-gray-100 dark:bg-gray-800 rounded p-4 overflow-x-auto text-gray-900 dark:text-gray-100">
                            {props.children}
                        </pre>
                    ),

                    // Other elements
                    blockquote: props => (
                        <blockquote className="border-l-4 border-gray-200 dark:border-gray-700 pl-4 italic text-gray-600 dark:text-gray-300">
                            {props.children}
                        </blockquote>
                    ),
                    a: props => (
                        <a
                            {...props}
                            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                            target="_blank"
                            rel="noopener noreferrer"
                        />
                    ),
                    img: props => (
                        <img
                            {...props}
                            className="max-w-full h-auto rounded-lg"
                            alt={props.alt || ''}
                        />
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
};

export default MarkdownRenderer; 