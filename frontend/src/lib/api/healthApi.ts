/**
 * Health API
 */

import { api } from './index';

export interface HealthResponse {
    status: string;
    version: string;
}

/**
 * Check backend health and get current version.
 */
export async function getHealth(): Promise<HealthResponse> {
    const { data } = await api.get('/api/health');
    return data;
}
