import { useState } from 'react';
import {
    ChevronDownIcon,
    ChevronRightIcon,
    DocumentTextIcon,
    UserGroupIcon,
    ChatBubbleBottomCenterTextIcon
} from '@heroicons/react/24/outline';
import { DocumentAnalysisResult } from '../../../types/document_analysis';

interface TreeViewProps {
    results: DocumentAnalysisResult;
    onNodeSelect: (nodeId: string) => void;
    selectedNodeId: string | null;
}

interface TreeNodeProps {
    id: string;
    label: string;
    children?: React.ReactNode;
    isSelected: boolean;
    onSelect: (id: string) => void;
    icon?: React.ReactNode;
    badge?: string;
    badgeColor?: string;
    depth: number;
    defaultExpanded?: boolean;
}

function TreeNode({
    id,
    label,
    children,
    isSelected,
    onSelect,
    icon,
    badge,
    badgeColor = 'gray',
    depth,
    defaultExpanded = false
}: TreeNodeProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded || depth < 1);
    const hasChildren = !!children;

    const badgeColors: Record<string, string> = {
        gray: 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300',
        blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
        green: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
        purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
        amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
    };

    return (
        <div className="select-none">
            <div
                className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors ${
                    isSelected
                        ? 'bg-blue-100 dark:bg-blue-900/30 border-l-4 border-blue-500'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                style={{ paddingLeft: `${depth * 16 + 12}px` }}
                onClick={() => {
                    onSelect(id);
                    if (hasChildren) setIsExpanded(!isExpanded);
                }}
            >
                {hasChildren ? (
                    <span className="text-gray-400 flex-shrink-0">
                        {isExpanded ? (
                            <ChevronDownIcon className="h-4 w-4" />
                        ) : (
                            <ChevronRightIcon className="h-4 w-4" />
                        )}
                    </span>
                ) : (
                    <span className="w-4" />
                )}
                {icon && <span className="flex-shrink-0">{icon}</span>}
                <span className="text-sm text-gray-900 dark:text-white flex-1 truncate">
                    {label}
                </span>
                {badge && (
                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${badgeColors[badgeColor]}`}>
                        {badge}
                    </span>
                )}
            </div>
            {isExpanded && children && (
                <div className="border-l border-gray-200 dark:border-gray-700 ml-6">
                    {children}
                </div>
            )}
        </div>
    );
}

// Detail panel for selected node
function DetailPanel({ results, selectedNodeId }: { results: DocumentAnalysisResult; selectedNodeId: string | null }) {
    if (!selectedNodeId) {
        return (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                Select an item to view details
            </div>
        );
    }

    // Find the selected item
    if (selectedNodeId === 'executive') {
        const exec = results.hierarchical_summary.executive;
        return (
            <div className="p-4 space-y-4">
                <h4 className="font-semibold text-gray-900 dark:text-white">Executive Summary</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{exec.summary}</p>
                {exec.main_themes.length > 0 && (
                    <div>
                        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Main Themes</h5>
                        <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400">
                            {exec.main_themes.map((theme, idx) => (
                                <li key={idx}>{theme}</li>
                            ))}
                        </ul>
                    </div>
                )}
                {exec.key_conclusions.length > 0 && (
                    <div>
                        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Key Conclusions</h5>
                        <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400">
                            {exec.key_conclusions.map((conclusion, idx) => (
                                <li key={idx}>{conclusion}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        );
    }

    // Check sections
    const section = results.hierarchical_summary.sections.find(s => s.id === selectedNodeId);
    if (section) {
        return (
            <div className="p-4 space-y-4">
                <h4 className="font-semibold text-gray-900 dark:text-white">{section.title}</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{section.summary}</p>
            </div>
        );
    }

    // Check key points
    for (const sec of results.hierarchical_summary.sections) {
        const kp = sec.key_points.find(k => k.id === selectedNodeId);
        if (kp) {
            return (
                <div className="p-4 space-y-4">
                    <h4 className="font-semibold text-gray-900 dark:text-white">Key Point</h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{kp.text}</p>
                    {kp.source_span && (
                        <div>
                            <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Source</h5>
                            <p className="text-sm text-gray-500 dark:text-gray-400 italic">"{kp.source_span}"</p>
                        </div>
                    )}
                    <div className="text-xs text-gray-500">Importance: {Math.round(kp.importance * 100)}%</div>
                </div>
            );
        }
    }

    // Check entities
    const entity = results.entities.find(e => e.id === selectedNodeId);
    if (entity) {
        return (
            <div className="p-4 space-y-4">
                <h4 className="font-semibold text-gray-900 dark:text-white">{entity.name}</h4>
                <div className="text-xs px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 inline-block">
                    {entity.category}
                </div>
                {entity.description && (
                    <p className="text-sm text-gray-700 dark:text-gray-300">{entity.description}</p>
                )}
                <div className="text-sm text-gray-600 dark:text-gray-400">
                    Mentioned {entity.mention_count} time{entity.mention_count !== 1 ? 's' : ''}
                </div>
                {entity.mentions.length > 0 && (
                    <div>
                        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Context</h5>
                        <ul className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                            {entity.mentions.slice(0, 3).map((mention, idx) => (
                                <li key={idx} className="italic">"{mention}"</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        );
    }

    // Check claims
    const claim = results.claims.find(c => c.id === selectedNodeId);
    if (claim) {
        return (
            <div className="p-4 space-y-4">
                <h4 className="font-semibold text-gray-900 dark:text-white">Claim</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300">{claim.claim}</p>
                <div className="flex gap-2">
                    <span className="text-xs px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                        {claim.claim_type}
                    </span>
                    <span className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        {Math.round(claim.confidence * 100)}% confidence
                    </span>
                </div>
                {claim.evidence.length > 0 && (
                    <div>
                        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Evidence</h5>
                        <ul className="text-sm text-gray-500 dark:text-gray-400 space-y-2">
                            {claim.evidence.map((ev, idx) => (
                                <li key={idx} className="flex items-start gap-2">
                                    <span className={`text-xs px-1 rounded ${
                                        ev.strength === 'strong' ? 'bg-green-100 text-green-700' :
                                        ev.strength === 'moderate' ? 'bg-amber-100 text-amber-700' :
                                        'bg-gray-100 text-gray-600'
                                    }`}>
                                        {ev.strength}
                                    </span>
                                    <span>{ev.text}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        );
    }

    return null;
}

export function TreeView({ results, onNodeSelect, selectedNodeId }: TreeViewProps) {
    const { hierarchical_summary, entities, claims } = results;

    return (
        <div className="flex h-full">
            {/* Tree Navigation */}
            <div className="w-1/2 border-r border-gray-200 dark:border-gray-700 overflow-y-auto p-2">
                {/* Executive Summary */}
                <TreeNode
                    id="executive"
                    label="Executive Summary"
                    isSelected={selectedNodeId === 'executive'}
                    onSelect={onNodeSelect}
                    depth={0}
                    defaultExpanded
                    icon={<DocumentTextIcon className="h-4 w-4 text-blue-500" />}
                    badge={`${hierarchical_summary.executive.main_themes.length} themes`}
                    badgeColor="blue"
                >
                    {/* Sections */}
                    {hierarchical_summary.sections.map((section) => (
                        <TreeNode
                            key={section.id}
                            id={section.id}
                            label={section.title}
                            isSelected={selectedNodeId === section.id}
                            onSelect={onNodeSelect}
                            depth={1}
                            badge={`${section.key_points.length} points`}
                            badgeColor="blue"
                        >
                            {section.key_points.map((point) => (
                                <TreeNode
                                    key={point.id}
                                    id={point.id}
                                    label={point.text.length > 60 ? point.text.slice(0, 60) + '...' : point.text}
                                    isSelected={selectedNodeId === point.id}
                                    onSelect={onNodeSelect}
                                    depth={2}
                                />
                            ))}
                        </TreeNode>
                    ))}
                </TreeNode>

                {/* Entities */}
                {entities.length > 0 && (
                    <TreeNode
                        id="entities-root"
                        label="Entities"
                        isSelected={false}
                        onSelect={() => {}}
                        depth={0}
                        icon={<UserGroupIcon className="h-4 w-4 text-green-500" />}
                        badge={`${entities.length}`}
                        badgeColor="green"
                    >
                        {entities.map((entity) => (
                            <TreeNode
                                key={entity.id}
                                id={entity.id}
                                label={entity.name}
                                isSelected={selectedNodeId === entity.id}
                                onSelect={onNodeSelect}
                                depth={1}
                                badge={entity.category}
                                badgeColor="green"
                            />
                        ))}
                    </TreeNode>
                )}

                {/* Claims */}
                {claims.length > 0 && (
                    <TreeNode
                        id="claims-root"
                        label="Claims & Arguments"
                        isSelected={false}
                        onSelect={() => {}}
                        depth={0}
                        icon={<ChatBubbleBottomCenterTextIcon className="h-4 w-4 text-purple-500" />}
                        badge={`${claims.length}`}
                        badgeColor="purple"
                    >
                        {claims.map((claim) => (
                            <TreeNode
                                key={claim.id}
                                id={claim.id}
                                label={claim.claim.length > 50 ? claim.claim.slice(0, 50) + '...' : claim.claim}
                                isSelected={selectedNodeId === claim.id}
                                onSelect={onNodeSelect}
                                depth={1}
                                badge={claim.claim_type}
                                badgeColor="purple"
                            />
                        ))}
                    </TreeNode>
                )}
            </div>

            {/* Detail Panel */}
            <div className="w-1/2 overflow-y-auto bg-gray-50 dark:bg-gray-900">
                <DetailPanel results={results} selectedNodeId={selectedNodeId} />
            </div>
        </div>
    );
}
