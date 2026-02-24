import { useCallback, useMemo } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    Node,
    Edge,
    useNodesState,
    useEdgesState,
    NodeTypes,
    Handle,
    Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import { DocumentAnalysisResult, GraphNode as GraphNodeType } from '../../../types/document_analysis';

interface GraphViewProps {
    results: DocumentAnalysisResult;
    onNodeSelect: (nodeId: string) => void;
    selectedNodeId: string | null;
}

// Custom node component for Executive Summary
function ExecutiveNode({ data, selected }: { data: GraphNodeType['data']; selected: boolean }) {
    return (
        <div className={`px-4 py-3 rounded-lg shadow-md border-2 transition-all ${
            selected
                ? 'bg-blue-100 dark:bg-blue-900 border-blue-500'
                : 'bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700'
        }`}>
            <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
            <div className="font-bold text-blue-700 dark:text-blue-300 text-sm">{data.label}</div>
            {data.details?.themes && (
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {data.details.themes.length} themes
                </div>
            )}
        </div>
    );
}

// Custom node component for Sections
function SectionNode({ data, selected }: { data: GraphNodeType['data']; selected: boolean }) {
    return (
        <div className={`px-3 py-2 rounded-lg shadow border-2 transition-all max-w-48 ${
            selected
                ? 'bg-indigo-100 dark:bg-indigo-900 border-indigo-500'
                : 'bg-indigo-50 dark:bg-indigo-950 border-indigo-300 dark:border-indigo-700'
        }`}>
            <Handle type="target" position={Position.Top} className="w-2 h-2" />
            <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
            <div className="font-medium text-indigo-700 dark:text-indigo-300 text-xs truncate">{data.label}</div>
            {data.details?.keyPointCount && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                    {data.details.keyPointCount} points
                </div>
            )}
        </div>
    );
}

// Custom node component for Key Points
function KeyPointNode({ data, selected }: { data: GraphNodeType['data']; selected: boolean }) {
    return (
        <div className={`px-2 py-1 rounded shadow border transition-all max-w-40 ${
            selected
                ? 'bg-gray-200 dark:bg-gray-700 border-gray-500'
                : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600'
        }`}>
            <Handle type="target" position={Position.Top} className="w-1.5 h-1.5" />
            <div className="text-xs text-gray-700 dark:text-gray-300 truncate">{data.label}</div>
        </div>
    );
}

// Custom node component for Entities
function EntityNode({ data, selected }: { data: GraphNodeType['data']; selected: boolean }) {
    const categoryColors: Record<string, string> = {
        person: 'bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-700',
        organization: 'bg-teal-50 dark:bg-teal-950 border-teal-300 dark:border-teal-700',
        concept: 'bg-violet-50 dark:bg-violet-950 border-violet-300 dark:border-violet-700',
        location: 'bg-rose-50 dark:bg-rose-950 border-rose-300 dark:border-rose-700',
        default: 'bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-700'
    };

    const selectedCategoryColors: Record<string, string> = {
        person: 'bg-amber-100 dark:bg-amber-900 border-amber-500',
        organization: 'bg-teal-100 dark:bg-teal-900 border-teal-500',
        concept: 'bg-violet-100 dark:bg-violet-900 border-violet-500',
        location: 'bg-rose-100 dark:bg-rose-900 border-rose-500',
        default: 'bg-green-100 dark:bg-green-900 border-green-500'
    };

    const category = data.details?.category || 'default';
    const colorClass = selected
        ? (selectedCategoryColors[category] || selectedCategoryColors.default)
        : (categoryColors[category] || categoryColors.default);

    return (
        <div className={`px-3 py-2 rounded-lg shadow border-2 transition-all max-w-36 ${colorClass}`}>
            <Handle type="target" position={Position.Left} className="w-2 h-2" />
            <Handle type="source" position={Position.Right} className="w-2 h-2" />
            <div className="font-medium text-green-700 dark:text-green-300 text-xs truncate">{data.label}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{category}</div>
        </div>
    );
}

// Custom node component for Claims
function ClaimNode({ data, selected }: { data: GraphNodeType['data']; selected: boolean }) {
    return (
        <div className={`px-3 py-2 rounded-lg shadow border-2 transition-all max-w-44 ${
            selected
                ? 'bg-purple-100 dark:bg-purple-900 border-purple-500'
                : 'bg-purple-50 dark:bg-purple-950 border-purple-300 dark:border-purple-700'
        }`}>
            <Handle type="target" position={Position.Top} className="w-2 h-2" />
            <Handle type="source" position={Position.Right} className="w-2 h-2" />
            <div className="font-medium text-purple-700 dark:text-purple-300 text-xs truncate">{data.label}</div>
            {data.details?.claimType && (
                <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{data.details.claimType}</div>
            )}
            {data.details?.confidence && (
                <div className="text-xs text-purple-500">
                    {Math.round(data.details.confidence * 100)}% confident
                </div>
            )}
        </div>
    );
}

// Node types mapping
const nodeTypes: NodeTypes = {
    executive: ExecutiveNode,
    section: SectionNode,
    keypoint: KeyPointNode,
    entity: EntityNode,
    claim: ClaimNode
};

export function GraphView({ results, onNodeSelect, selectedNodeId }: GraphViewProps) {
    // Convert backend graph data to React Flow format
    const initialNodes = useMemo((): Node[] => {
        return results.graph_nodes.map((node) => ({
            id: node.id,
            type: node.type,
            position: node.position,
            data: node.data,
            selected: node.id === selectedNodeId
        }));
    }, [results.graph_nodes, selectedNodeId]);

    const initialEdges = useMemo((): Edge[] => {
        return results.graph_edges.map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            type: edge.type || 'smoothstep',
            label: edge.label,
            animated: edge.label === 'supports',
            style: {
                stroke: edge.label === 'related' ? '#94a3b8' : '#64748b',
                strokeWidth: edge.label === 'supports' ? 2 : 1
            }
        }));
    }, [results.graph_edges]);

    const [nodes, , onNodesChange] = useNodesState(initialNodes);
    const [edges, , onEdgesChange] = useEdgesState(initialEdges);

    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        onNodeSelect(node.id);
    }, [onNodeSelect]);

    // Update nodes when selection changes
    const nodesWithSelection = useMemo(() => {
        return nodes.map(node => ({
            ...node,
            selected: node.id === selectedNodeId
        }));
    }, [nodes, selectedNodeId]);

    return (
        <div style={{ width: '100%', height: '500px' }}>
            <ReactFlow
                nodes={nodesWithSelection}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.5}
                maxZoom={2}
                attributionPosition="bottom-left"
            >
                <Background color="#94a3b8" gap={16} size={1} />
                <Controls className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg" />
                <MiniMap
                    nodeStrokeColor={(n) => {
                        switch (n.type) {
                            case 'executive': return '#3b82f6';
                            case 'section': return '#6366f1';
                            case 'entity': return '#22c55e';
                            case 'claim': return '#a855f7';
                            default: return '#64748b';
                        }
                    }}
                    nodeColor={(n) => {
                        switch (n.type) {
                            case 'executive': return '#dbeafe';
                            case 'section': return '#e0e7ff';
                            case 'entity': return '#dcfce7';
                            case 'claim': return '#f3e8ff';
                            default: return '#f1f5f9';
                        }
                    }}
                    className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                />
            </ReactFlow>
        </div>
    );
}
