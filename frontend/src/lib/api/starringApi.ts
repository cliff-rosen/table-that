import { api } from './index';
import { ReportArticle } from '../../types/report';

export const starringApi = {
    /**
     * Toggle the star status of an article for the current user
     */
    async toggleStar(reportId: number, articleId: number): Promise<{ is_starred: boolean }> {
        const response = await api.post(`/api/stars/reports/${reportId}/articles/${articleId}/toggle`);
        return response.data;
    },

    /**
     * Get all starred articles for a specific stream
     */
    async getStarredForStream(streamId: number): Promise<{ articles: ReportArticle[] }> {
        const response = await api.get(`/api/stars/streams/${streamId}`);
        return response.data;
    },

    /**
     * Get count of starred articles for a specific stream
     */
    async getStarredCountForStream(streamId: number): Promise<{ count: number }> {
        const response = await api.get(`/api/stars/streams/${streamId}/count`);
        return response.data;
    },

    /**
     * Get all starred articles for the current user
     */
    async getAllStarred(limit?: number): Promise<{ articles: ReportArticle[] }> {
        const params = limit ? `?limit=${limit}` : '';
        const response = await api.get(`/api/stars${params}`);
        return response.data;
    },
};
