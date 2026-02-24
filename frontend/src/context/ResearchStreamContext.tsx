import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
    researchStreamApi,
    ResearchStreamCreateRequest,
    ResearchStreamUpdateRequest,
    handleApiError
} from '../lib/api';
import { showErrorToast } from '../lib/errorToast';
import { ResearchStream, InformationSource } from '../types';

interface ResearchStreamContextType {
    // State
    researchStreams: ResearchStream[];
    selectedStream: ResearchStream | null;
    isLoading: boolean;
    error: string | null;
    availableSources: InformationSource[];

    // Actions
    loadResearchStreams: () => Promise<void>;
    loadResearchStream: (streamId: number) => Promise<void>;
    createResearchStream: (stream: ResearchStreamCreateRequest) => Promise<ResearchStream>;
    updateResearchStream: (streamId: number, updates: ResearchStreamUpdateRequest) => Promise<void>;
    deleteResearchStream: (streamId: number) => Promise<void>;
    toggleStreamStatus: (streamId: number, isActive: boolean) => Promise<void>;
    selectStream: (stream: ResearchStream | null) => void;
    clearError: () => void;
    loadAvailableSources: () => Promise<void>;
}

const ResearchStreamContext = createContext<ResearchStreamContextType | undefined>(undefined);

interface ResearchStreamProviderProps {
    children: ReactNode;
}

export function ResearchStreamProvider({ children }: ResearchStreamProviderProps) {
    const [researchStreams, setResearchStreams] = useState<ResearchStream[]>([]);
    const [selectedStream, setSelectedStream] = useState<ResearchStream | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [availableSources, setAvailableSources] = useState<InformationSource[]>([]);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    const selectStream = useCallback((stream: ResearchStream | null) => {
        setSelectedStream(stream);
    }, []);

    const loadResearchStreams = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const streams = await researchStreamApi.getResearchStreams();
            setResearchStreams(streams);
        } catch (err) {
            const errorMsg = handleApiError(err);
            setError(errorMsg);
            showErrorToast(errorMsg, 'Failed to load streams');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const loadResearchStream = useCallback(async (streamId: number) => {
        setIsLoading(true);
        setError(null);
        try {
            const stream = await researchStreamApi.getResearchStream(streamId);
            setSelectedStream(stream);

            // Update the stream in the list if it exists
            setResearchStreams(prev =>
                prev.map(s => s.stream_id === streamId ? stream : s)
            );
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    }, []);

    const createResearchStream = useCallback(async (stream: ResearchStreamCreateRequest): Promise<ResearchStream> => {
        setIsLoading(true);
        setError(null);
        try {
            const newStream = await researchStreamApi.createResearchStream(stream);
            setResearchStreams(prev => [...prev, newStream]);
            return newStream;
        } catch (err) {
            setError(handleApiError(err));
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const updateResearchStream = useCallback(async (streamId: number, updates: ResearchStreamUpdateRequest) => {
        setIsLoading(true);
        setError(null);
        try {
            const updatedStream = await researchStreamApi.updateResearchStream(streamId, updates);

            // Update in the list
            setResearchStreams(prev =>
                prev.map(s => s.stream_id === streamId ? updatedStream : s)
            );

            // Update selected stream if it's the one being updated
            if (selectedStream?.stream_id === streamId) {
                setSelectedStream(updatedStream);
            }
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    }, [selectedStream]);

    const deleteResearchStream = useCallback(async (streamId: number) => {
        setIsLoading(true);
        setError(null);
        try {
            await researchStreamApi.deleteResearchStream(streamId);

            // Remove from list
            setResearchStreams(prev => prev.filter(s => s.stream_id !== streamId));

            // Clear selected stream if it's the one being deleted
            if (selectedStream?.stream_id === streamId) {
                setSelectedStream(null);
            }
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    }, [selectedStream]);

    const toggleStreamStatus = useCallback(async (streamId: number, isActive: boolean) => {
        setIsLoading(true);
        setError(null);
        try {
            const updatedStream = await researchStreamApi.toggleResearchStreamStatus(streamId, isActive);

            // Update in the list
            setResearchStreams(prev =>
                prev.map(s => s.stream_id === streamId ? updatedStream : s)
            );

            // Update selected stream if it's the one being updated
            if (selectedStream?.stream_id === streamId) {
                setSelectedStream(updatedStream);
            }
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    }, [selectedStream]);

    const loadAvailableSources = useCallback(async () => {
        try {
            const sources = await researchStreamApi.getInformationSources();
            setAvailableSources(sources);
        } catch (err) {
            console.error('Failed to load available sources:', err);
        }
    }, []);

    const value: ResearchStreamContextType = {
        // State
        researchStreams,
        selectedStream,
        isLoading,
        error,
        availableSources,

        // Actions
        loadResearchStreams,
        loadResearchStream,
        createResearchStream,
        updateResearchStream,
        deleteResearchStream,
        toggleStreamStatus,
        selectStream,
        clearError,
        loadAvailableSources,
    };

    return (
        <ResearchStreamContext.Provider value={value}>
            {children}
        </ResearchStreamContext.Provider>
    );
}

export function useResearchStream(): ResearchStreamContextType {
    const context = useContext(ResearchStreamContext);
    if (context === undefined) {
        throw new Error('useResearchStream must be used within a ResearchStreamProvider');
    }
    return context;
}