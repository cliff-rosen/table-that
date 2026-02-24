import { useState, useEffect, useCallback } from 'react';
import {
    PencilIcon,
    TrashIcon,
    PlusIcon,
    UserIcon,
    UsersIcon,
    XMarkIcon,
    CheckIcon
} from '@heroicons/react/24/outline';
import { notesApi } from '../../lib/api/notesApi';
import { handleApiError } from '../../lib/api';
import type { ArticleNote } from '../../types/organization';
import { useAuth } from '../../context/AuthContext';

interface ArticleNotesProps {
    reportId: number;
    articleId: number;
}

export default function ArticleNotes({ reportId, articleId }: ArticleNotesProps) {
    const { user } = useAuth();
    const [notes, setNotes] = useState<ArticleNote[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // New note form state
    const [showNewNoteForm, setShowNewNoteForm] = useState(false);
    const [newNoteContent, setNewNoteContent] = useState('');
    const [newNoteVisibility, setNewNoteVisibility] = useState<'personal' | 'shared'>('personal');
    const [isSaving, setIsSaving] = useState(false);

    // Edit state
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');
    const [editVisibility, setEditVisibility] = useState<'personal' | 'shared'>('personal');
    const [isUpdating, setIsUpdating] = useState(false);

    const loadNotes = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await notesApi.getNotes(reportId, articleId);
            setNotes(response.notes);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    }, [reportId, articleId]);

    useEffect(() => {
        loadNotes();
    }, [loadNotes]);

    const handleCreateNote = async () => {
        if (!newNoteContent.trim()) return;

        setIsSaving(true);
        setError(null);
        try {
            const newNote = await notesApi.createNote(reportId, articleId, {
                content: newNoteContent.trim(),
                visibility: newNoteVisibility
            });
            setNotes(prev => [...prev, newNote]);
            setNewNoteContent('');
            setNewNoteVisibility('personal');
            setShowNewNoteForm(false);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsSaving(false);
        }
    };

    const handleStartEdit = (note: ArticleNote) => {
        setEditingNoteId(note.id);
        setEditContent(note.content);
        setEditVisibility(note.visibility);
    };

    const handleCancelEdit = () => {
        setEditingNoteId(null);
        setEditContent('');
        setEditVisibility('personal');
    };

    const handleSaveEdit = async () => {
        if (!editingNoteId || !editContent.trim()) return;

        setIsUpdating(true);
        setError(null);
        try {
            const updatedNote = await notesApi.updateNote(reportId, articleId, editingNoteId, {
                content: editContent.trim(),
                visibility: editVisibility
            });
            setNotes(prev => prev.map(n => n.id === editingNoteId ? updatedNote : n));
            handleCancelEdit();
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsUpdating(false);
        }
    };

    const handleDeleteNote = async (noteId: string) => {
        if (!confirm('Are you sure you want to delete this note?')) return;

        try {
            await notesApi.deleteNote(reportId, articleId, noteId);
            setNotes(prev => prev.filter(n => n.id !== noteId));
        } catch (err) {
            setError(handleApiError(err));
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    const isOwnNote = (note: ArticleNote) => {
        return user && note.user_id === user.id;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Notes ({notes.length})
                </h2>
                {!showNewNoteForm && (
                    <button
                        onClick={() => setShowNewNoteForm(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                        <PlusIcon className="h-4 w-4" />
                        Add Note
                    </button>
                )}
            </div>

            {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
                    {error}
                </div>
            )}

            {/* New Note Form */}
            {showNewNoteForm && (
                <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                    <textarea
                        value={newNoteContent}
                        onChange={(e) => setNewNoteContent(e.target.value)}
                        placeholder="Write your note..."
                        className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={4}
                        autoFocus
                    />
                    <div className="mt-3 flex items-center justify-between">
                        {/* Visibility Toggle */}
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600 dark:text-gray-400">Visibility:</span>
                            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                                <button
                                    onClick={() => setNewNoteVisibility('personal')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm ${
                                        newNoteVisibility === 'personal'
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    <UserIcon className="h-4 w-4" />
                                    Personal
                                </button>
                                <button
                                    onClick={() => setNewNoteVisibility('shared')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border-l border-gray-200 dark:border-gray-700 ${
                                        newNoteVisibility === 'shared'
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    <UsersIcon className="h-4 w-4" />
                                    Shared
                                </button>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    setShowNewNoteForm(false);
                                    setNewNoteContent('');
                                    setNewNoteVisibility('personal');
                                }}
                                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateNote}
                                disabled={isSaving || !newNoteContent.trim()}
                                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <CheckIcon className="h-4 w-4" />
                                        Save Note
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {newNoteVisibility === 'personal'
                            ? 'Only you can see personal notes'
                            : 'Shared notes are visible to your organization members'}
                    </p>
                </div>
            )}

            {/* Notes List */}
            <div className="flex-1 overflow-y-auto space-y-4">
                {notes.length === 0 && !showNewNoteForm && (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <p>No notes yet</p>
                        <p className="text-sm mt-1">Add a note to keep track of your thoughts on this article</p>
                    </div>
                )}

                {notes.map((note) => (
                    <div
                        key={note.id}
                        className={`p-4 rounded-lg border ${
                            isOwnNote(note)
                                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                                : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700'
                        }`}
                    >
                        {editingNoteId === note.id ? (
                            /* Edit Mode */
                            <div>
                                <textarea
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value)}
                                    className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    rows={4}
                                    autoFocus
                                />
                                <div className="mt-3 flex items-center justify-between">
                                    {/* Visibility Toggle */}
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-gray-600 dark:text-gray-400">Visibility:</span>
                                        <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                                            <button
                                                onClick={() => setEditVisibility('personal')}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm ${
                                                    editVisibility === 'personal'
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                                }`}
                                            >
                                                <UserIcon className="h-4 w-4" />
                                                Personal
                                            </button>
                                            <button
                                                onClick={() => setEditVisibility('shared')}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border-l border-gray-200 dark:border-gray-700 ${
                                                    editVisibility === 'shared'
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                                }`}
                                            >
                                                <UsersIcon className="h-4 w-4" />
                                                Shared
                                            </button>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={handleCancelEdit}
                                            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleSaveEdit}
                                            disabled={isUpdating || !editContent.trim()}
                                            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isUpdating ? (
                                                <>
                                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                                    Saving...
                                                </>
                                            ) : (
                                                <>
                                                    <CheckIcon className="h-4 w-4" />
                                                    Save
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* View Mode */
                            <>
                                {/* Note Header */}
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-gray-900 dark:text-white">
                                            {isOwnNote(note) ? 'You' : note.author_name}
                                        </span>
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${
                                            note.visibility === 'personal'
                                                ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                                : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                        }`}>
                                            {note.visibility === 'personal' ? (
                                                <><UserIcon className="h-3 w-3" /> Personal</>
                                            ) : (
                                                <><UsersIcon className="h-3 w-3" /> Shared</>
                                            )}
                                        </span>
                                    </div>
                                    {isOwnNote(note) && (
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => handleStartEdit(note)}
                                                className="p-1.5 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 rounded hover:bg-white dark:hover:bg-gray-800"
                                                title="Edit note"
                                            >
                                                <PencilIcon className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteNote(note.id)}
                                                className="p-1.5 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 rounded hover:bg-white dark:hover:bg-gray-800"
                                                title="Delete note"
                                            >
                                                <TrashIcon className="h-4 w-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Note Content */}
                                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                    {note.content}
                                </p>

                                {/* Note Footer */}
                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                    {note.created_at !== note.updated_at
                                        ? `Updated ${formatDate(note.updated_at)}`
                                        : formatDate(note.created_at)}
                                </p>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
