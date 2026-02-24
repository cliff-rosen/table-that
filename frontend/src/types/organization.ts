/**
 * Organization and multi-tenancy types for Knowledge Horizon
 *
 * Organized to mirror backend schemas/organization.py for easy cross-reference.
 * Section order:
 *   1. Re-exports (for backwards compatibility)
 *   2. Organization Types
 *   3. Member Types
 *   4. Subscription Types
 *   5. Notes Types
 *   6. Invitation Types
 */

// ============================================================================
// RE-EXPORTS (for backwards compatibility)
// ============================================================================

// Re-export user types that are commonly imported from organization.ts
export type { UserRole, OrgMember, User as AdminUser, UserList } from './user';

// ============================================================================
// ORGANIZATION TYPES
// ============================================================================

// Stream scope
export type StreamScope = 'global' | 'organization' | 'personal';

// Organization
export interface Organization {
  org_id: number;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

// ============================================================================
// MEMBER TYPES
// ============================================================================

export interface OrganizationWithStats extends Organization {
  member_count: number;
  stream_count: number;
  pending_invitation_count: number;
}

export interface OrganizationUpdate {
  name?: string;
  is_active?: boolean;
}

// Member update
export interface OrgMemberUpdate {
  role: import('./user').UserRole;
}

// ============================================================================
// SUBSCRIPTION TYPES
// ============================================================================

export interface StreamSubscriptionStatus {
  stream_id: number;
  stream_name: string;
  scope: StreamScope;
  purpose?: string;
  is_org_subscribed?: boolean;
  is_user_subscribed: boolean;
  is_user_opted_out: boolean;
  created_at: string;
}

export interface GlobalStreamLibrary {
  streams: StreamSubscriptionStatus[];
  total_count: number;
}

export interface OrgStreamList {
  streams: StreamSubscriptionStatus[];
  total_count: number;
}

// ============================================================================
// NOTES TYPES
// ============================================================================

export interface ArticleNote {
  id: string;
  user_id: number;
  author_name: string;
  content: string;
  visibility: 'personal' | 'shared';
  created_at: string;
  updated_at: string;
}

export interface ArticleNoteCreate {
  content: string;
  visibility?: 'personal' | 'shared';
}

export interface ArticleNoteUpdate {
  content?: string;
  visibility?: 'personal' | 'shared';
}

export interface ArticleNotesResponse {
  report_id: number;
  article_id: number;
  notes: ArticleNote[];
  total_count: number;
}

// ============================================================================
// INVITATION TYPES
// ============================================================================

export interface Invitation {
  invitation_id: number;
  email: string;
  org_id?: number;
  org_name?: string;
  role: string;
  token: string;
  invite_url: string;
  created_at: string;
  expires_at: string;
  accepted_at?: string;
  is_revoked: boolean;
  inviter_email?: string;
}
