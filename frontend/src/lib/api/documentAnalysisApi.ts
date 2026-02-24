import { api } from './index';
import { makeStreamRequest } from './streamUtils';
import {
    DocumentAnalysisRequest,
    DocumentAnalysisResult,
    AnalysisStreamMessage,
    StanceAnalysisRequest,
    StanceAnalysisResult
} from '../../types/document_analysis';

export const documentAnalysisApi = {
    /**
     * Analyze a document with AI-powered extraction (non-streaming)
     */
    async analyzeDocument(request: DocumentAnalysisRequest): Promise<DocumentAnalysisResult> {
        const response = await api.post('/api/tools/document-analysis/analyze', request);
        return response.data;
    },

    /**
     * Analyze a document with streaming progress updates
     * @param request - The document analysis request
     * @param onMessage - Callback for each streaming message
     * @param signal - Optional AbortSignal for cancellation
     * @returns Promise that resolves with the final result
     */
    async analyzeDocumentStream(
        request: DocumentAnalysisRequest,
        onMessage: (message: AnalysisStreamMessage) => void,
        signal?: AbortSignal
    ): Promise<DocumentAnalysisResult | null> {
        let finalResult: DocumentAnalysisResult | null = null;
        let buffer = '';

        for await (const update of makeStreamRequest(
            '/api/tools/document-analysis/analyze-stream',
            request,
            'POST',
            signal
        )) {
            // Accumulate data and split by SSE format
            buffer += update.data;
            const lines = buffer.split('\n');

            // Keep the last potentially incomplete line in the buffer
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith('data: ')) {
                    try {
                        const jsonStr = trimmedLine.slice(6);
                        if (jsonStr) {
                            const message: AnalysisStreamMessage = JSON.parse(jsonStr);
                            onMessage(message);

                            // Extract final result
                            if (message.type === 'result' && message.data?.result) {
                                finalResult = message.data.result as DocumentAnalysisResult;
                            }

                            // Handle errors
                            if (message.type === 'error') {
                                throw new Error(message.message || 'Analysis failed');
                            }
                        }
                    } catch (parseError) {
                        // Skip malformed JSON, may be partial data
                        if (parseError instanceof SyntaxError) {
                            continue;
                        }
                        throw parseError;
                    }
                }
            }
        }

        // Process any remaining data in buffer
        if (buffer.trim().startsWith('data: ')) {
            try {
                const jsonStr = buffer.trim().slice(6);
                if (jsonStr) {
                    const message: AnalysisStreamMessage = JSON.parse(jsonStr);
                    onMessage(message);

                    if (message.type === 'result' && message.data?.result) {
                        finalResult = message.data.result as DocumentAnalysisResult;
                    }
                }
            } catch {
                // Ignore parse errors in final buffer
            }
        }

        return finalResult;
    },

    /**
     * Analyze an article's stance (pro-defense vs pro-plaintiff)
     * Uses stream-specific classification instructions
     */
    async analyzeStance(request: StanceAnalysisRequest): Promise<StanceAnalysisResult> {
        const response = await api.post('/api/tools/document-analysis/analyze-stance', request);
        return response.data;
    },

    /**
     * Health check for document analysis service
     */
    async healthCheck(): Promise<{ status: string; service: string }> {
        const response = await api.get('/api/tools/document-analysis/health');
        return response.data;
    }
};
