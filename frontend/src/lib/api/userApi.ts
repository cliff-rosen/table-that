/**
 * User API service for user profile operations.
 * Accessed via the profile icon in the top nav.
 */

import { api } from './index';
import type { User } from '../../types/user';

// ============== Request Types ==============

export interface UserUpdateRequest {
  full_name?: string;
  job_title?: string;
}

export interface PasswordChangeRequest {
  current_password: string;
  new_password: string;
}

// ============== API ==============

export const userApi = {
  /**
   * Get current user profile
   */
  async getMe(): Promise<User> {
    const response = await api.get('/api/user/me');
    return response.data;
  },

  /**
   * Update current user profile
   */
  async updateMe(updates: UserUpdateRequest): Promise<User> {
    const response = await api.put('/api/user/me', updates);
    return response.data;
  },

  /**
   * Change current user's password
   */
  async changePassword(data: PasswordChangeRequest): Promise<{ message: string }> {
    const response = await api.post('/api/user/me/password', data);
    return response.data;
  },
};
