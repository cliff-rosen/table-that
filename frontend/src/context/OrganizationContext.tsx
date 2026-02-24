import React, { createContext, useContext, useState, useCallback } from 'react';
import { organizationApi } from '../lib/api/organizationApi';
import { subscriptionApi } from '../lib/api/subscriptionApi';
import { handleApiError } from '../lib/api';
import type {
  Organization,
  OrganizationUpdate,
  OrgMember,
  UserRole,
  StreamSubscriptionStatus,
  GlobalStreamLibrary
} from '../types/organization';

interface OrganizationContextType {
  // Organization data
  organization: Organization | null;
  members: OrgMember[];

  // Global stream subscriptions (for org admins)
  globalStreams: StreamSubscriptionStatus[];

  // Loading states
  isLoading: boolean;
  isMembersLoading: boolean;
  isStreamsLoading: boolean;

  // Error state
  error: string | null;

  // Organization methods
  loadOrganization: () => Promise<void>;
  updateOrganization: (data: OrganizationUpdate) => Promise<void>;

  // Member methods
  loadMembers: () => Promise<void>;
  updateMemberRole: (userId: number, role: UserRole) => Promise<void>;
  removeMember: (userId: number) => Promise<void>;

  // Subscription methods (org admin)
  loadGlobalStreams: () => Promise<void>;
  subscribeToGlobalStream: (streamId: number) => Promise<void>;
  unsubscribeFromGlobalStream: (streamId: number) => Promise<void>;

  // Utility
  clearError: () => void;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export const OrganizationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [globalStreams, setGlobalStreams] = useState<StreamSubscriptionStatus[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isMembersLoading, setIsMembersLoading] = useState(false);
  const [isStreamsLoading, setIsStreamsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Organization methods
  const loadOrganization = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const org = await organizationApi.getOrganization();
      setOrganization(org);
    } catch (err) {
      const errorMsg = handleApiError(err);
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateOrganization = useCallback(async (data: OrganizationUpdate) => {
    setIsLoading(true);
    setError(null);
    try {
      const updated = await organizationApi.updateOrganization(data);
      setOrganization(updated);
    } catch (err) {
      const errorMsg = handleApiError(err);
      setError(errorMsg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Member methods
  const loadMembers = useCallback(async () => {
    setIsMembersLoading(true);
    setError(null);
    try {
      const memberList = await organizationApi.getMembers();
      setMembers(memberList);
    } catch (err) {
      const errorMsg = handleApiError(err);
      setError(errorMsg);
    } finally {
      setIsMembersLoading(false);
    }
  }, []);

  const updateMemberRole = useCallback(async (userId: number, role: UserRole) => {
    setError(null);
    try {
      await organizationApi.updateMemberRole(userId, role);
      // Refresh members list
      const memberList = await organizationApi.getMembers();
      setMembers(memberList);
    } catch (err) {
      const errorMsg = handleApiError(err);
      setError(errorMsg);
      throw err;
    }
  }, []);

  const removeMember = useCallback(async (userId: number) => {
    setError(null);
    try {
      await organizationApi.removeMember(userId);
      // Remove from local state
      setMembers(prev => prev.filter(m => m.user_id !== userId));
    } catch (err) {
      const errorMsg = handleApiError(err);
      setError(errorMsg);
      throw err;
    }
  }, []);

  // Subscription methods
  const loadGlobalStreams = useCallback(async () => {
    setIsStreamsLoading(true);
    setError(null);
    try {
      const result: GlobalStreamLibrary = await subscriptionApi.getGlobalStreamsForOrg();
      setGlobalStreams(result.streams);
    } catch (err) {
      const errorMsg = handleApiError(err);
      setError(errorMsg);
    } finally {
      setIsStreamsLoading(false);
    }
  }, []);

  const subscribeToGlobalStream = useCallback(async (streamId: number) => {
    setError(null);
    try {
      await subscriptionApi.subscribeOrgToGlobalStream(streamId);
      // Update local state
      setGlobalStreams(prev =>
        prev.map(s =>
          s.stream_id === streamId ? { ...s, is_org_subscribed: true } : s
        )
      );
    } catch (err) {
      const errorMsg = handleApiError(err);
      setError(errorMsg);
      throw err;
    }
  }, []);

  const unsubscribeFromGlobalStream = useCallback(async (streamId: number) => {
    setError(null);
    try {
      await subscriptionApi.unsubscribeOrgFromGlobalStream(streamId);
      // Update local state
      setGlobalStreams(prev =>
        prev.map(s =>
          s.stream_id === streamId ? { ...s, is_org_subscribed: false } : s
        )
      );
    } catch (err) {
      const errorMsg = handleApiError(err);
      setError(errorMsg);
      throw err;
    }
  }, []);

  return (
    <OrganizationContext.Provider
      value={{
        organization,
        members,
        globalStreams,
        isLoading,
        isMembersLoading,
        isStreamsLoading,
        error,
        loadOrganization,
        updateOrganization,
        loadMembers,
        updateMemberRole,
        removeMember,
        loadGlobalStreams,
        subscribeToGlobalStream,
        unsubscribeFromGlobalStream,
        clearError
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
};

export const useOrganization = () => {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
};
