# Stream Types Architecture

## Philosophy

Four clean layers:
1. **Research Stream Domain** - The anatomy of a stream (the model)
2. **Stream Building** - Building a stream (workflow, steps, actions)
3. **UI Layer** - Display and interaction (messages, UI elements)
4. **API Layer** - Request/response wrappers

---

## Layer 1: Research Stream Domain

**File: `types/research-stream.ts`**

```typescript
// ============================================================================
// Core stream model (matches backend)
// ============================================================================

export enum StreamType {
    COMPETITIVE = 'competitive',
    REGULATORY = 'regulatory',
    CLINICAL = 'clinical',
    MARKET = 'market',
    SCIENTIFIC = 'scientific',
    MIXED = 'mixed'
}

export enum ReportFrequency {
    DAILY = 'daily',
    WEEKLY = 'weekly',
    BIWEEKLY = 'biweekly',
    MONTHLY = 'monthly'
}

export interface ScoringConfig {
    relevance_weight: number;
    evidence_weight: number;
    inclusion_threshold: number;
    max_items_per_report?: number;
}

// Complete stream (from backend)
export interface ResearchStream {
    stream_id: number;
    user_id: number;
    stream_name: string;
    description?: string;
    stream_type: StreamType;
    focus_areas: string[];
    competitors: string[];
    report_frequency: ReportFrequency;
    is_active: boolean;
    created_at: string;
    updated_at: string;

    // Phase 1 fields
    purpose?: string;
    business_goals?: string[];
    expected_outcomes?: string;
    keywords?: string[];
    scoring_config?: ScoringConfig;

    // Aggregated
    report_count?: number;
    latest_report_date?: string | null;
}
```

---

## Layer 2: Stream Building

**File: `types/stream-building.ts`**

```typescript
import { ScoringConfig } from './research-stream';

// ============================================================================
// Stream being built (all fields optional as they're filled in progressively)
// ============================================================================

export interface StreamInProgress {
    purpose?: string;
    business_goals?: string[];
    expected_outcomes?: string;
    stream_name?: string;
    stream_type?: string;  // string during building, validated on submission
    description?: string;
    focus_areas?: string[];
    keywords?: string[];
    competitors?: string[];
    report_frequency?: string;  // string during building, validated on submission
    scoring_config?: ScoringConfig;
}

// ============================================================================
// Build workflow steps
// ============================================================================

export type StreamBuildStep =
    | 'exploration'
    | 'purpose'
    | 'business_goals'
    | 'expected_outcomes'
    | 'stream_name'
    | 'stream_type'
    | 'focus_areas'
    | 'keywords'
    | 'competitors'
    | 'report_frequency'
    | 'review'
    | 'complete';

// ============================================================================
// User actions during building
// ============================================================================

export type UserActionType =
    | 'select_suggestion'    // Clicked a suggestion chip
    | 'confirm_selection'    // Clicked continue with checkboxes
    | 'text_input'          // Typed free text
    | 'skip_step'           // Skipped optional field
    | 'accept_review';      // Accepted final review

export interface UserAction {
    type: UserActionType;
    target_field?: string;      // Which field this affects
    selected_value?: string;    // Single selection
    selected_values?: string[]; // Multiple selections
}

// ============================================================================
// Interactive UI elements presented by AI
// ============================================================================

export interface Suggestion {
    label: string;
    value: string;
}

export interface MultiSelectOption {
    label: string;
    value: string;
    checked: boolean;
}
```

---

## Layer 3: Chat Layer

**File: `types/stream-builder-chat.ts`**

```typescript
import { Suggestion, MultiSelectOption } from './stream-building';

// ============================================================================
// Chat messages (for display)
// ============================================================================

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;

    // AI response elements (only on assistant messages)
    suggestions?: Suggestion[];
    options?: MultiSelectOption[];
    continueButtonText?: string;  // Text for the "Continue" button
}
```

---

## Layer 4: API Layer

**File: `lib/api/researchStreamApi.ts`**

```typescript
import { ResearchStream, StreamType, ReportFrequency } from '../../types/research-stream';
import {
    StreamInProgress,
    StreamBuildStep,
    UserAction,
    Suggestion,
    MultiSelectOption
} from '../../types/stream-building';

// ============================================================================
// Stream Building Chat API
// ============================================================================

// Simple message format for API requests
export interface ApiMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface StreamBuildChatRequest {
    message: string;
    current_stream: StreamInProgress;
    current_step: StreamBuildStep;
    conversation_history: ApiMessage[];
    user_action?: UserAction;
}

// ============================================================================
// SSE Streaming Response Types
// ============================================================================

// The parsed payload from a complete LLM response
export interface StreamBuildChatPayload {
    message: string;                      // AI's response text
    mode: 'QUESTION' | 'SUGGESTION' | 'REVIEW';  // Response mode
    target_field: string | null;          // Field being asked about
    next_step: StreamBuildStep;           // Next workflow step
    updated_stream: StreamInProgress;     // Updated stream data
    suggestions?: Suggestion[];           // Suggestion chips (if mode=SUGGESTION)
    options?: MultiSelectOption[];        // Checkboxes (if mode=SUGGESTION)
    proposed_message?: string;            // Button text for options
}

// Status updates during streaming (thinking, tool use, etc.)
export interface StatusResponse {
    status: string;
    payload: string | object | null;
    error: string | null;
    debug: string | object | null;
}

// Token-by-token streaming response from LLM
export interface AgentResponse {
    token: string | null;                 // Individual token
    response_text: string | null;         // Accumulated text
    payload: StreamBuildChatPayload | null;  // Final parsed response
    status: string | null;
    error: string | null;
    debug: string | object | null;
}

// Union type for all possible stream responses
export type StreamResponse = AgentResponse | StatusResponse;

// Response: AsyncGenerator that yields StreamResponse objects

// ============================================================================
// Stream CRUD API
// ============================================================================

export interface CreateStreamRequest {
    stream_name: string;
    description?: string;
    stream_type: StreamType;
    focus_areas: string[];
    competitors: string[];
    report_frequency: ReportFrequency;

    // Phase 1 required
    purpose: string;
    business_goals: string[];
    expected_outcomes: string;
    keywords: string[];
}

export interface UpdateStreamRequest {
    stream_name?: string;
    description?: string;
    stream_type?: StreamType;
    focus_areas?: string[];
    competitors?: string[];
    report_frequency?: ReportFrequency;
    is_active?: boolean;

    // Phase 1 optional updates
    purpose?: string;
    business_goals?: string[];
    expected_outcomes?: string;
    keywords?: string[];
}

// ============================================================================
// API Interface
// ============================================================================

export const researchStreamApi = {
    // CRUD operations
    getStreams(): Promise<ResearchStream[]>
    getStream(streamId: number): Promise<ResearchStream>
    createStream(request: CreateStreamRequest): Promise<ResearchStream>
    updateStream(streamId: number, request: UpdateStreamRequest): Promise<ResearchStream>
    deleteStream(streamId: number): Promise<void>
    toggleStatus(streamId: number, isActive: boolean): Promise<ResearchStream>

    // Stream building chat
    streamBuildChat(request: StreamBuildChatRequest): AsyncGenerator<StreamResponse>
}
```

---

## Summary

### Layer 1: Research Stream Domain (`types/research-stream.ts`)
**What it contains:**
- `ResearchStream` - The complete stream model (matches backend)
- `StreamType`, `ReportFrequency` - Enums
- `ScoringConfig` - Scoring configuration

**Purpose:** Core domain model (the stream itself)

---

### Layer 2: Stream Building (`types/stream-building.ts`)
**What it contains:**
- `StreamInProgress` - The stream being built
- `StreamBuildStep` - Steps in the build process
- `UserActionType`, `UserAction` - User interactions during building
- `Suggestion`, `MultiSelectOption` - Interactive elements from AI

**Purpose:** Stream building workflow, state, and interactions

---

### Layer 3: Chat (`types/stream-builder-chat.ts`)
**What it contains:**
- `ChatMessage` - Message for display (with suggestions/options)

**Purpose:** Chat message display structure

---

### Layer 4: API (`lib/api/researchStreamApi.ts`)
**What it contains:**
- **Chat Request:** `StreamBuildChatRequest`, `ApiMessage`
- **Chat Response Payload:** `StreamBuildChatPayload` (the specific payload structure)
- **SSE Streaming:** `AgentResponse`, `StatusResponse`, `StreamResponse`
- **CRUD:** `CreateStreamRequest`, `UpdateStreamRequest`
- **API functions**

**Purpose:** All API contracts - requests, responses, and streaming types

---

## Key Improvements

1. ✅ **No naming collision** - No `ChatMessage` in types, only `ApiMessage` in API layer
2. ✅ **Clear separation** - Domain → UI → API
3. ✅ **Specific names** - `StreamInProgress` instead of `PartialStreamConfig`
4. ✅ **Domain-first** - Stream types own the building process
5. ✅ **SSE types in API** - `AgentResponse`, `StatusResponse`, `StreamResponse` live in the API file
6. ✅ **No chat.ts dependency** - Stream building doesn't import from generic chat types
7. ✅ **Reusable** - `Suggestion` and `MultiSelectOption` can be used elsewhere
8. ✅ **No redundancy** - Each type has one clear home

## Migration Path

1. Create `types/stream-building.ts`:
   - Move `StreamInProgress`, `StreamBuildStep`, `UserAction` from research-stream.ts

2. Create `types/stream-builder-ui.ts`:
   - Move UI types: `Suggestion`, `MultiSelectOption`, `StreamBuilderMessage`, etc.

3. Update `lib/api/researchStreamApi.ts`:
   - Add `AgentResponse`, `StatusResponse`, `StreamResponse` (from types/chat.ts)
   - Add `ApiMessage`
   - Update imports to use `types/stream-building.ts`
   - Remove imports from `types/chat.ts`

4. Update `context/StreamChatContext.tsx`:
   - Rename to `StreamBuilderContext.tsx`
   - Import from `types/stream-building.ts` and `types/stream-builder-ui.ts`
   - Rename state variables

5. Update components to use new imports

6. Delete old `types/stream-chat.ts` and `types/stream-creation.ts` (if created)
