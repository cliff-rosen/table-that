/**
 * Organization API service for managing user's organization
 */

import { api } from './index';
import type { Organization, OrganizationUpdate, OrgMember, UserRole } from '../../types/organization';

export const organizationApi = {
  /**
   * Get current user's organization
   */
  async getOrganization(): Promise<Organization> {
    const response = await api.get('/api/org');
    return response.data;
  },

  /**
   * Update organization details (org admin only)
   */
  async updateOrganization(data: OrganizationUpdate): Promise<Organization> {
    const response = await api.put('/api/org', data);
    return response.data;
  },

  /**
   * Get all members of the organization
   */
  async getMembers(): Promise<OrgMember[]> {
    const response = await api.get('/api/org/members');
    return response.data;
  },

  /**
   * Update a member's role (org admin only)
   */
  async updateMemberRole(userId: number, role: UserRole): Promise<OrgMember> {
    const response = await api.put(`/api/org/members/${userId}`, { role });
    return response.data;
  },

  /**
   * Remove a member from the organization (org admin only)
   */
  async removeMember(userId: number): Promise<void> {
    await api.delete(`/api/org/members/${userId}`);
  }
};
