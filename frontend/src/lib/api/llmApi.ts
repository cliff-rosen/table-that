/**
 * LLM API service for LLM-related operations.
 * Provides access to available models and their configurations.
 */

import { api } from './index';
import type { ModelInfo } from '../../types';

// ============== Response Types ==============

export interface ModelsResponse {
  models: ModelInfo[];
  default_model: string;
}

// ============== API ==============

export const llmApi = {
  /**
   * Get available LLM models and their capabilities
   */
  async getModels(): Promise<ModelsResponse> {
    const response = await api.get<ModelsResponse>('/api/llm/models');
    return response.data;
  },
};
