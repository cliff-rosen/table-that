/**
 * Subscription API service for managing stream subscriptions
 */

import { api } from './index';
import type { GlobalStreamLibrary, OrgStreamList, StreamSubscriptionStatus } from '../../types/organization';

export const subscriptionApi = {
  // ==================== Org Admin: Global Stream Subscriptions ====================

  /**
   * Get all global streams with org subscription status (org admin only)
   */
  async getGlobalStreamsForOrg(): Promise<GlobalStreamLibrary> {
    const response = await api.get('/api/subscriptions/org/global-streams');
    return response.data;
  },

  /**
   * Subscribe org to a global stream (org admin only)
   */
  async subscribeOrgToGlobalStream(streamId: number): Promise<{ status: string; stream_id: number }> {
    const response = await api.post(`/api/subscriptions/org/global-streams/${streamId}`);
    return response.data;
  },

  /**
   * Unsubscribe org from a global stream (org admin only)
   */
  async unsubscribeOrgFromGlobalStream(streamId: number): Promise<void> {
    await api.delete(`/api/subscriptions/org/global-streams/${streamId}`);
  },

  // ==================== User: Org Stream Subscriptions ====================

  /**
   * Get org streams available to user for subscription
   */
  async getOrgStreamsForUser(): Promise<OrgStreamList> {
    const response = await api.get('/api/subscriptions/org-streams');
    return response.data;
  },

  /**
   * Subscribe user to an org stream
   */
  async subscribeToOrgStream(streamId: number): Promise<{ status: string; stream_id: number }> {
    const response = await api.post(`/api/subscriptions/org-streams/${streamId}`);
    return response.data;
  },

  /**
   * Unsubscribe user from an org stream
   */
  async unsubscribeFromOrgStream(streamId: number): Promise<void> {
    await api.delete(`/api/subscriptions/org-streams/${streamId}`);
  },

  // ==================== User: Global Stream Opt-Out ====================

  /**
   * Get global streams available to user (via org subscription)
   */
  async getGlobalStreamsForUser(): Promise<StreamSubscriptionStatus[]> {
    const response = await api.get('/api/subscriptions/global-streams');
    return response.data;
  },

  /**
   * Opt out of a global stream
   */
  async optOutOfGlobalStream(streamId: number): Promise<{ status: string; stream_id: number }> {
    const response = await api.post(`/api/subscriptions/global-streams/${streamId}/opt-out`);
    return response.data;
  },

  /**
   * Opt back into a global stream
   */
  async optBackIntoGlobalStream(streamId: number): Promise<{ status: string; stream_id: number }> {
    const response = await api.delete(`/api/subscriptions/global-streams/${streamId}/opt-out`);
    return response.data;
  }
};
