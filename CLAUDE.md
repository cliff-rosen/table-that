# Project Guidelines for Claude

## Code Structure

Follow the rules in [CODE_STRUCTURE_CHECKLIST.md](./CODE_STRUCTURE_CHECKLIST.md) for all backend and frontend code.

---

## Layout Guidelines

### Flex Height Pattern (REQUIRED for scrollable content)

When creating components with scrollable areas that should fill available space:

1. **Never use arbitrary max-height** like `max-h-[600px]` on scrollable containers
2. **Always use the flex chain pattern:**
   - Parent page: `min-h-screen flex flex-col`
   - Fixed elements (header/footer): `flex-shrink-0`
   - Main content area: `flex-1 min-h-0 flex flex-col`
   - Scrollable container: `flex-1 min-h-0 overflow-auto`

3. **Key classes:**
   - `min-h-0` - Required on flex children to allow shrinking below content size
   - `flex-shrink-0` - Prevents headers/toolbars from shrinking
   - `h-full` - Passes height from parent to child

### Example pattern:
```tsx
<div className="min-h-screen flex flex-col">
  <header className="flex-shrink-0">...</header>
  <main className="flex-1 min-h-0 flex flex-col">
    <div className="flex-shrink-0">toolbar</div>
    <div className="flex-1 min-h-0 overflow-auto">scrollable content</div>
  </main>
  <footer className="flex-shrink-0">...</footer>
</div>
```

---

## Modal Guidelines

When creating modals:

1. **Fixed size, never changes** - Modals must NOT change size when users click around or switch tabs
2. **Almost maximized for long content** - If the modal contains long text, lists, or tabbed content, make it nearly full-screen
3. **Use viewport-relative sizing** with max-width constraints

### Standard modal sizes:

```tsx
// Small modal (confirmations, simple forms)
className="w-full max-w-md"

// Medium modal (forms, settings)
className="w-[600px] h-[500px]"

// Large modal with long content (lists, previews, multi-tab)
className="w-[calc(100vw-4rem)] max-w-[1200px] h-[calc(100vh-4rem)]"
```

### Text editing modals (ALWAYS full-size)

**When a modal's primary purpose is editing text that is likely to be large** (system prompts, instructions, documentation, code), the modal MUST be near-maximized:

```tsx
// Text editing modal - always near full-screen
className="w-[calc(100vw-4rem)] max-w-[1400px] h-[calc(100vh-4rem)]"
```

This includes:
- Stream/page instructions editing
- System prompt/identity editing
- Help content editing
- Any freeform text configuration

Rationale: Users need to see as much context as possible when editing long text. Small modals force constant scrolling and make it hard to review what's been written.

### Required structure for scrollable modals:
```tsx
<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[calc(100vw-4rem)] max-w-[1200px] h-[calc(100vh-4rem)] flex flex-col">
    {/* Header - fixed */}
    <div className="flex-shrink-0 px-6 py-4 border-b">...</div>
    {/* Tabs if any - fixed */}
    <div className="flex-shrink-0 px-6 pt-4 border-b">...</div>
    {/* Content - scrollable */}
    <div className="flex-1 overflow-y-auto p-6">...</div>
  </div>
</div>
```

---

## Data Fetching Pattern for AI-Enabled Tables

When building table components that support AI column processing (like Tablizer or TrialScout):

1. **Two-phase fetch strategy:**
   - Initial search: Fetch small number (e.g., 20-50) for fast display
   - AI processing: Expand to larger set (e.g., 500) when user adds an AI column

2. **Implementation requirements:**
   - Store `lastSearchParams` to enable re-fetching with expanded limit
   - Track `hasFetchedFullSet` state to avoid redundant fetches
   - Provide `onFetchMoreForAI` callback prop to table component
   - Show user feedback: "Fetched X of Y (more fetched for AI)"

3. **Help text must explain:**
   - Initial results are limited for fast display
   - Adding AI columns automatically fetches more records
   - Maximum records available for AI processing

### Example constants:
```tsx
const INITIAL_FETCH_LIMIT = 20;   // Fast initial display
const AI_FETCH_LIMIT = 500;       // Max for AI processing
const DISPLAY_LIMIT = 100;        // Max shown in table
```

See `TablizePubMed.tsx` for reference implementation.
