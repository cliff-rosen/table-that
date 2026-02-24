/**
 * Shared types for diagnostics components
 */

// Content block types for message rendering
export interface TextBlock {
    type: 'text';
    text: string;
}

export interface ToolUseBlock {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, unknown>;
}

export interface ToolResultBlock {
    type: 'tool_result';
    tool_use_id: string;
    content: string;
    is_error?: boolean;
}

export interface UnknownBlock {
    type: string;
    [key: string]: unknown;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | UnknownBlock;

// Fullscreen content types
export type FullscreenContent =
    | { type: 'raw'; title: string; content: string }
    | { type: 'messages'; title: string; messages: Array<Record<string, unknown>> }
    | { type: 'blocks'; title: string; blocks: Array<Record<string, unknown>> };

// Role styling
export const ROLE_STYLES: Record<string, { bg: string; text: string }> = {
    system: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-800 dark:text-purple-400' },
    user: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-800 dark:text-blue-400' },
    assistant: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-400' },
};

// Helper functions
export function normalizeContent(content: unknown): ContentBlock[] {
    if (typeof content === 'string') {
        return [{ type: 'text', text: content }];
    }
    if (Array.isArray(content)) {
        return content as ContentBlock[];
    }
    // Unknown format - wrap as text
    return [{ type: 'text', text: JSON.stringify(content, null, 2) }];
}

export function getContentSummary(blocks: ContentBlock[]): { text: string; badges: string[] } {
    const badges: string[] = [];
    let textPreview = '';

    for (const block of blocks) {
        if (block.type === 'text' && 'text' in block) {
            const text = (block as TextBlock).text;
            if (!textPreview) {
                textPreview = text.slice(0, 80);
            }
        } else if (block.type === 'tool_use' && 'name' in block) {
            badges.push((block as ToolUseBlock).name);
        } else if (block.type === 'tool_result') {
            badges.push('result');
        }
    }

    return {
        text: textPreview + (textPreview.length >= 80 ? '...' : ''),
        badges
    };
}
