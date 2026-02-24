/**
 * Notes API service for article notes
 */

import { api } from './index';
import type {
  ArticleNote,
  ArticleNoteCreate,
  ArticleNoteUpdate,
  ArticleNotesResponse
} from '../../types/organization';

export const notesApi = {
  /**
   * Get all visible notes for an article
   */
  async getNotes(reportId: number, articleId: number): Promise<ArticleNotesResponse> {
    const response = await api.get(`/api/notes/reports/${reportId}/articles/${articleId}`);
    return response.data;
  },

  /**
   * Create a new note on an article
   */
  async createNote(reportId: number, articleId: number, data: ArticleNoteCreate): Promise<ArticleNote> {
    const response = await api.post(`/api/notes/reports/${reportId}/articles/${articleId}`, data);
    return response.data;
  },

  /**
   * Update an existing note
   */
  async updateNote(
    reportId: number,
    articleId: number,
    noteId: string,
    data: ArticleNoteUpdate
  ): Promise<ArticleNote> {
    const response = await api.put(
      `/api/notes/reports/${reportId}/articles/${articleId}/notes/${noteId}`,
      data
    );
    return response.data;
  },

  /**
   * Delete a note
   */
  async deleteNote(reportId: number, articleId: number, noteId: string): Promise<void> {
    await api.delete(`/api/notes/reports/${reportId}/articles/${articleId}/notes/${noteId}`);
  }
};
