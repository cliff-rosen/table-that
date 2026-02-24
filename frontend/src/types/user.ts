/**
 * User types for Knowledge Horizon
 *
 * Core user types. Request schemas are in the API files.
 *
 * Organized to mirror backend schemas/user.py for easy cross-reference.
 * Section order:
 *   1. Enums
 *   2. User Types
 *   3. Auth Types
 */

// ============================================================================
// ENUMS
// ============================================================================

/**
 * User roles (matches backend UserRole enum)
 *
 * Role hierarchy and org_id relationship:
 * - platform_admin: org_id = null. Platform-level access, above all orgs.
 * - org_admin: org_id required. Manages their organization.
 * - member: org_id required. Regular user in an organization.
 */
export type UserRole = 'platform_admin' | 'org_admin' | 'member';

// ============================================================================
// USER TYPES
// ============================================================================

/**
 * Full user type returned from API
 */
export interface User {
  user_id: number;
  email: string;
  full_name?: string;
  job_title?: string;
  role: UserRole;
  org_id?: number;
  is_active: boolean;
  registration_date: string;
  created_at: string;
  updated_at: string;
}

/**
 * Minimal user info for lists and references
 */
export interface UserSummary {
  user_id: number;
  email: string;
  full_name?: string;
  role: UserRole;
}

/**
 * User as a member of an organization
 */
export interface OrgMember {
  user_id: number;
  email: string;
  full_name?: string;
  role: UserRole;
  joined_at?: string;
}

/**
 * Paginated user list response
 */
export interface UserList {
  users: User[];
  total: number;
}

// ============================================================================
// AUTH TYPES
// ============================================================================

/**
 * Authentication token response
 */
export interface Token {
  access_token: string;
  token_type: string;
  user_id: number;
  email: string;
  username: string;
  role: UserRole;
  org_id?: number;
}

/**
 * Context user type (simplified for client-side state)
 */
export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  org_id?: number;
}
