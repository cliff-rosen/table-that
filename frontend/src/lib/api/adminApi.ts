/**
 * Admin API service for platform administration
 */

import { api } from './index';
import type {
  Organization,
  OrganizationWithStats,
  OrganizationUpdate,
  UserRole,
  Invitation,
  StreamSubscriptionStatus
} from '../../types/organization';
import type { User, UserList } from '../../types/user';
import type { Artifact, ArtifactCategory } from '../../types/artifact';

// Import ResearchStream type from existing types
interface ResearchStream {
  stream_id: number;
  stream_name: string;
  purpose: string;
  scope: string;
  org_id?: number;
  user_id?: number;
  created_by?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const adminApi = {
  // ==================== Organization Management ====================

  /**
   * Get all organizations (platform admin only)
   */
  async getAllOrganizations(): Promise<OrganizationWithStats[]> {
    const response = await api.get('/api/admin/orgs');
    return response.data;
  },

  /**
   * Create a new organization (platform admin only)
   */
  async createOrganization(name: string): Promise<Organization> {
    const response = await api.post('/api/admin/orgs', null, { params: { name } });
    return response.data;
  },

  /**
   * Get organization by ID (platform admin only)
   */
  async getOrganization(orgId: number): Promise<OrganizationWithStats> {
    const response = await api.get(`/api/admin/orgs/${orgId}`);
    return response.data;
  },

  /**
   * Update organization (platform admin only)
   */
  async updateOrganization(orgId: number, data: OrganizationUpdate): Promise<Organization> {
    const response = await api.put(`/api/admin/orgs/${orgId}`, data);
    return response.data;
  },

  /**
   * Delete organization (platform admin only)
   */
  async deleteOrganization(orgId: number): Promise<void> {
    await api.delete(`/api/admin/orgs/${orgId}`);
  },

  /**
   * Assign user to organization (platform admin only)
   */
  async assignUserToOrg(orgId: number, userId: number): Promise<{ status: string; user_id: number; org_id: number }> {
    const response = await api.put(`/api/admin/orgs/${orgId}/members/${userId}`);
    return response.data;
  },

  // ==================== Global Stream Management ====================

  /**
   * Get all global streams (platform admin only)
   */
  async getGlobalStreams(): Promise<ResearchStream[]> {
    const response = await api.get('/api/admin/streams');
    return response.data;
  },

  /**
   * Promote stream to global scope (platform admin only)
   */
  async setStreamScopeGlobal(streamId: number): Promise<ResearchStream> {
    const response = await api.put(`/api/admin/streams/${streamId}/scope`);
    return response.data;
  },

  /**
   * Delete a global stream (platform admin only)
   */
  async deleteGlobalStream(streamId: number): Promise<void> {
    await api.delete(`/api/admin/streams/${streamId}`);
  },

  // ==================== User Management ====================

  /**
   * Get all users, optionally filtered by org, role, or active status (platform admin only)
   */
  async getAllUsers(params?: {
    org_id?: number;
    role?: UserRole;
    is_active?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<UserList> {
    const response = await api.get('/api/admin/users', { params });
    return response.data;
  },

  /**
   * Update user role (platform admin only)
   */
  async updateUserRole(userId: number, role: UserRole): Promise<User> {
    const response = await api.put(`/api/admin/users/${userId}/role`, null, { params: { new_role: role } });
    return response.data;
  },

  /**
   * Delete a user (platform admin only)
   */
  async deleteUser(userId: number): Promise<void> {
    await api.delete(`/api/admin/users/${userId}`);
  },

  // ==================== Invitation Management ====================

  /**
   * Get all invitations (platform admin only)
   */
  async getInvitations(params?: {
    org_id?: number;
    include_accepted?: boolean;
    include_expired?: boolean;
  }): Promise<Invitation[]> {
    const response = await api.get('/api/admin/invitations', { params });
    return response.data;
  },

  /**
   * Create a new invitation (platform admin only)
   */
  async createInvitation(data: {
    email: string;
    org_id?: number;
    role?: UserRole;
    expires_in_days?: number;
  }): Promise<Invitation> {
    const response = await api.post('/api/admin/invitations', data);
    return response.data;
  },

  /**
   * Revoke an invitation (platform admin only)
   */
  async revokeInvitation(invitationId: number): Promise<void> {
    await api.delete(`/api/admin/invitations/${invitationId}`);
  },

  /**
   * Create a user directly (platform admin only)
   */
  async createUser(data: {
    email: string;
    password: string;
    full_name?: string;
    org_id: number;
    role?: UserRole;
  }): Promise<User> {
    const response = await api.post('/api/admin/users/create', data);
    return response.data;
  },

  // ==================== Organization Stream Subscriptions ====================

  /**
   * Get global streams with subscription status for an org (platform admin only)
   */
  async getOrgGlobalStreams(orgId: number): Promise<StreamSubscriptionStatus[]> {
    const response = await api.get(`/api/admin/orgs/${orgId}/global-streams`);
    return response.data;
  },

  /**
   * Subscribe an org to a global stream (platform admin only)
   */
  async subscribeOrgToGlobalStream(orgId: number, streamId: number): Promise<void> {
    await api.post(`/api/admin/orgs/${orgId}/global-streams/${streamId}`);
  },

  /**
   * Unsubscribe an org from a global stream (platform admin only)
   */
  async unsubscribeOrgFromGlobalStream(orgId: number, streamId: number): Promise<void> {
    await api.delete(`/api/admin/orgs/${orgId}/global-streams/${streamId}`);
  },

  // ==================== Chat System Configuration ====================

  /**
   * Get chat system configuration (platform admin only)
   */
  async getChatConfig(): Promise<ChatConfigResponse> {
    const response = await api.get('/api/admin/chat-config');
    return response.data;
  },

  // ==================== Help Content Management ====================

  /**
   * Get all help categories with topic counts (platform admin only)
   */
  async getHelpCategories(): Promise<HelpCategoriesResponse> {
    const response = await api.get('/api/admin/help/categories');
    return response.data;
  },

  /**
   * Get all topics in a help category with full content (platform admin only)
   */
  async getHelpCategory(category: string): Promise<HelpCategoryDetail> {
    const response = await api.get(`/api/admin/help/categories/${category}`);
    return response.data;
  },

  /**
   * Get a single help topic (platform admin only)
   */
  async getHelpTopic(category: string, topic: string): Promise<HelpTopicContent> {
    const response = await api.get(`/api/admin/help/categories/${category}/topics/${topic}`);
    return response.data;
  },

  /**
   * Bulk update topics in a help category (platform admin only)
   */
  async updateHelpCategory(category: string, topics: HelpTopicUpdate[]): Promise<HelpCategoryDetail> {
    const response = await api.put(`/api/admin/help/categories/${category}`, { topics });
    return response.data;
  },

  /**
   * Update a single help topic (platform admin only)
   */
  async updateHelpTopic(category: string, topic: string, content: string): Promise<HelpTopicContent> {
    const response = await api.put(`/api/admin/help/categories/${category}/topics/${topic}`, null, { params: { content } });
    return response.data;
  },

  /**
   * Reset all overrides in a help category to defaults (platform admin only)
   */
  async resetHelpCategory(category: string): Promise<{ status: string; category: string; overrides_deleted: number }> {
    const response = await api.delete(`/api/admin/help/categories/${category}/overrides`);
    return response.data;
  },

  /**
   * Reset a single topic override to default (platform admin only)
   */
  async resetHelpTopic(category: string, topic: string): Promise<{ status: string; category: string; topic: string; override_deleted: boolean }> {
    const response = await api.delete(`/api/admin/help/categories/${category}/topics/${topic}/override`);
    return response.data;
  },

  /**
   * Preview TOC as seen by each role (platform admin only)
   */
  async getHelpTocPreview(): Promise<HelpTOCPreview[]> {
    const response = await api.get('/api/admin/help/toc-preview');
    return response.data;
  },

  /**
   * Reload help content from YAML files (platform admin only)
   */
  async reloadHelpContent(): Promise<{ status: string; topics_loaded: number }> {
    const response = await api.post('/api/admin/help/reload');
    return response.data;
  },

  /**
   * Get help TOC configuration (platform admin only)
   */
  async getHelpTocConfig(): Promise<HelpTOCConfig> {
    const response = await api.get('/api/admin/help/toc-config');
    return response.data;
  },

  /**
   * Update help TOC configuration (platform admin only)
   */
  async updateHelpTocConfig(update: HelpTOCConfigUpdate): Promise<HelpTOCConfig> {
    const response = await api.put('/api/admin/help/toc-config', update);
    return response.data;
  },

  /**
   * Reset help TOC configuration to defaults (platform admin only)
   */
  async resetHelpTocConfig(): Promise<{ status: string; message: string }> {
    const response = await api.delete('/api/admin/help/toc-config');
    return response.data;
  },

  /**
   * Get all topic summaries for inline editing (platform admin only)
   */
  async getHelpSummaries(): Promise<TopicSummariesResponse> {
    const response = await api.get('/api/admin/help/summaries');
    return response.data;
  },

  /**
   * Update a single topic summary (platform admin only)
   */
  async updateHelpSummary(category: string, topic: string, summary: string): Promise<TopicSummaryInfo> {
    const response = await api.put(`/api/admin/help/summaries/${category}/${topic}`, { category, topic, summary });
    return response.data;
  },

  // ==================== Unified Chat Config Management ====================

  /**
   * Get all stream chat configs (platform admin only)
   */
  async getStreamConfigs(): Promise<StreamChatConfig[]> {
    const response = await api.get('/api/admin/chat-config/streams');
    return response.data;
  },

  /**
   * Get chat config for a specific stream (platform admin only)
   */
  async getStreamConfig(streamId: number): Promise<StreamChatConfig> {
    const response = await api.get(`/api/admin/chat-config/streams/${streamId}`);
    return response.data;
  },

  /**
   * Update chat config for a stream (platform admin only)
   */
  async updateStreamConfig(streamId: number, content: string | null): Promise<StreamChatConfig> {
    const response = await api.put(`/api/admin/chat-config/streams/${streamId}`, { content });
    return response.data;
  },

  /**
   * Get all page chat configs (platform admin only)
   */
  async getPageConfigs(): Promise<PageChatConfig[]> {
    const response = await api.get('/api/admin/chat-config/pages');
    return response.data;
  },

  /**
   * Get chat config for a specific page (platform admin only)
   */
  async getPageConfig(page: string): Promise<PageChatConfig> {
    const response = await api.get(`/api/admin/chat-config/pages/${encodeURIComponent(page)}`);
    return response.data;
  },

  /**
   * Update chat config for a page (platform admin only)
   */
  async updatePageConfig(page: string, data: ChatConfigUpdate): Promise<PageChatConfig> {
    const response = await api.put(`/api/admin/chat-config/pages/${encodeURIComponent(page)}`, data);
    return response.data;
  },

  /**
   * Delete chat config override for a page (platform admin only)
   */
  async deletePageConfig(page: string): Promise<{ status: string; page: string }> {
    const response = await api.delete(`/api/admin/chat-config/pages/${encodeURIComponent(page)}`);
    return response.data;
  },

  // ==================== System Chat Config ====================

  /**
   * Get system chat configuration (platform admin only)
   */
  async getSystemConfig(): Promise<SystemConfig> {
    const response = await api.get('/api/admin/chat-config/system');
    return response.data;
  },

  /**
   * Update system chat configuration (platform admin only)
   */
  async updateSystemConfig(data: SystemConfigUpdate): Promise<SystemConfig> {
    const response = await api.put('/api/admin/chat-config/system', data);
    return response.data;
  },

  // ==================== Artifact Management ====================

  /**
   * Get all artifacts with optional filters (platform admin only)
   */
  async getArtifacts(params?: { type?: string; status?: string; category?: string }): Promise<Artifact[]> {
    const response = await api.get('/api/admin/artifacts', {
      params: {
        type: params?.type || undefined,
        status_filter: params?.status || undefined,
        category: params?.category || undefined,
      },
    });
    return response.data;
  },

  /**
   * Create a new artifact (platform admin only)
   */
  async createArtifact(data: { title: string; artifact_type: string; description?: string; category?: string; priority?: string; status?: string; area?: string }): Promise<Artifact> {
    const response = await api.post('/api/admin/artifacts', data);
    return response.data;
  },

  /**
   * Update an artifact (platform admin only)
   */
  async updateArtifact(id: number, data: { title?: string; description?: string; status?: string; artifact_type?: string; category?: string; priority?: string; area?: string }): Promise<Artifact> {
    const response = await api.put(`/api/admin/artifacts/${id}`, data);
    return response.data;
  },

  /**
   * Delete an artifact (platform admin only)
   */
  async deleteArtifact(id: number): Promise<void> {
    await api.delete(`/api/admin/artifacts/${id}`);
  },

  // ==================== Artifact Bulk Operations ====================

  async bulkUpdateArtifacts(ids: number[], data: { status?: string; category?: string; priority?: string; area?: string }): Promise<{ updated: number }> {
    const response = await api.post('/api/admin/artifacts/bulk-update', { ids, ...data });
    return response.data;
  },

  async bulkDeleteArtifacts(ids: number[]): Promise<void> {
    await api.post('/api/admin/artifacts/bulk-delete', { ids });
  },

  // ==================== Artifact Categories ====================

  async getArtifactCategories(): Promise<ArtifactCategory[]> {
    const response = await api.get('/api/admin/artifact-categories');
    return response.data;
  },

  async createArtifactCategory(name: string): Promise<ArtifactCategory> {
    const response = await api.post('/api/admin/artifact-categories', { name });
    return response.data;
  },

  async bulkCreateArtifactCategories(names: string[]): Promise<ArtifactCategory[]> {
    const response = await api.post('/api/admin/artifact-categories/bulk', { names });
    return response.data;
  },

  async renameArtifactCategory(id: number, name: string): Promise<ArtifactCategory> {
    const response = await api.put(`/api/admin/artifact-categories/${id}`, { name });
    return response.data;
  },

  async deleteArtifactCategory(id: number): Promise<{ name: string; affected_count: number }> {
    const response = await api.delete(`/api/admin/artifact-categories/${id}`);
    return response.data;
  },
};

// Chat config types
export interface PayloadTypeInfo {
  name: string;
  description: string;
  source: 'tool' | 'llm';
  is_global: boolean;
  parse_marker?: string;
  has_parser: boolean;
  has_instructions: boolean;
  schema?: Record<string, unknown>;  // JSON Schema for the payload data
}

export interface ToolInputSchema {
  type: string;
  properties?: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
    default?: unknown;
    minimum?: number;
    maximum?: number;
  }>;
  required?: string[];
}

export interface ToolInfo {
  name: string;
  description: string;
  category: string;
  is_global: boolean;
  payload_type?: string;
  streaming: boolean;
  input_schema?: ToolInputSchema;
}

export interface SubTabConfigInfo {
  payloads: string[];
  tools: string[];
}

export interface TabConfigInfo {
  payloads: string[];
  tools: string[];
  subtabs: Record<string, SubTabConfigInfo>;
}

export interface PageConfigInfo {
  page: string;
  has_context_builder: boolean;
  payloads: string[];
  tools: string[];
  tabs: Record<string, TabConfigInfo>;
  client_actions: string[];
}

export interface StreamInstructionsInfo {
  stream_id: number;
  stream_name: string;
  has_instructions: boolean;
  instructions_preview?: string;
}

export interface ChatConfigResponse {
  payload_types: PayloadTypeInfo[];
  tools: ToolInfo[];
  pages: PageConfigInfo[];
  stream_instructions: StreamInstructionsInfo[];
  summary: {
    total_payload_types: number;
    global_payloads: number;
    llm_payloads: number;
    tool_payloads: number;
    total_tools: number;
    global_tools: number;
    total_pages: number;
    total_streams: number;
    streams_with_instructions: number;
  };
}

// Help content types
export interface HelpTopicContent {
  category: string;
  topic: string;
  title: string;
  summary: string;
  roles: string[];
  order: number;
  content: string;
  has_override: boolean;
}

export interface HelpCategorySummary {
  category: string;
  label: string;
  topic_count: number;
  override_count: number;
}

export interface HelpCategoryDetail {
  category: string;
  label: string;
  topics: HelpTopicContent[];
}

export interface HelpCategoriesResponse {
  categories: HelpCategorySummary[];
  total_topics: number;
  total_overrides: number;
}

export interface HelpTopicUpdate {
  category: string;
  topic: string;
  content: string;
}

export interface HelpTOCPreview {
  role: string;
  toc: string;
}

export interface HelpTOCConfig {
  preamble: string;
  narrative: string;  // Explains when/why to use the help tool
}

export interface HelpTOCConfigUpdate {
  preamble?: string | null;
  narrative?: string | null;  // Explains when/why to use the help tool
}

// Topic summary types for inline editing
export interface TopicSummaryInfo {
  category: string;
  topic: string;
  title: string;
  default_summary: string;  // From YAML
  current_summary: string;  // May be overridden
  has_override: boolean;
  roles: string[];  // Which roles can see this topic
}

export interface TopicSummariesResponse {
  categories: Record<string, TopicSummaryInfo[]>;
}

// Unified Chat Config types
export interface StreamChatConfig {
  stream_id: number;
  stream_name: string;
  content: string | null;  // Stream instructions
  has_override: boolean;
}

export interface PageChatConfig {
  page: string;
  content: string | null;  // Page persona
  has_override: boolean;
  default_content: string | null;
  default_is_global: boolean;
}

export interface ChatConfigUpdate {
  content?: string | null;
}

// System config types
export interface SystemConfig {
  max_tool_iterations: number;
  global_preamble: string | null;
  default_global_preamble: string;
}

export interface SystemConfigUpdate {
  max_tool_iterations?: number;
  global_preamble?: string | null;
  clear_global_preamble?: boolean;
}
