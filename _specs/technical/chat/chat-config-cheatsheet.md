# Chat Configuration Cheat Sheet

A guide for administrators to configure, monitor, and troubleshoot the chat system.

---

## Part 1: How the Chat System Works

### The Big Picture

The chat assistant is an AI that can:
1. **Answer questions about how to use KH** by retrieving help documentation
2. **Answer questions about user data** by calling tools that query reports, articles, streams, etc.

The assistant's behavior is shaped by **layered configuration** that combines at runtime:

```
GLOBAL PREAMBLE
    Sets the assistant's identity, tone, and universal rules
    (e.g., "be concise", "don't hallucinate", "handle ambiguity gracefully")
        ↓
PAGE PERSONA
    Tells the assistant what users do on this specific page
    and what tools/capabilities are available
        ↓
STREAM INSTRUCTIONS
    Provides domain-specific context for research streams
    (e.g., terminology, priorities, interpretation notes)
        ↓
HELP CONTENT
    Documentation the assistant can retrieve to answer "how to" questions
        ↓
TOOLS
    Actions the assistant can perform to query data or trigger UI actions
```

When a user asks a question, the assistant receives all these layers combined into a single prompt, then decides how to respond.

### The Two Types of Questions

Almost every user question falls into one of two categories:

| Type | Examples | What Should Happen |
|------|----------|-------------------|
| **Navigation** | "How do I create a stream?" / "What does filter_score mean?" / "Where do I find archived reports?" | Assistant calls `get_help` tool, retrieves documentation, explains |
| **Analytical** | "How many articles mention CRISPR?" / "Summarize this report" / "Compare these two reports" | Assistant calls data tools, retrieves results, interprets for user |

**This distinction is critical for troubleshooting.** When chat fails, the first question is: *what type of question was it?* The failure modes are completely different.

---

## Part 2: Diagnosing Failures by Question Type

### Navigation Questions (Help/How-To)

**Expected behavior:** Assistant calls `get_help` → retrieves relevant documentation → explains to user

**Failure Tree:**

```
User asks "How do I...?" or "What does X mean?"
    ↓
Did assistant call get_help tool?
    ├── NO → Problem: Query Classification
    │         The assistant didn't recognize this as a help question
    │         Fix: Edit GLOBAL PREAMBLE to clarify when to use help
    │
    └── YES → Did get_help return useful content?
                ├── NO → Problem: Missing Help Content
                │         The documentation doesn't cover this topic
                │         Fix: Add content in Admin → Chat Config → Help
                │
                └── YES → Did assistant explain it correctly?
                            ├── NO → Problem: Interpretation
                            │         Assistant misread the help content
                            │         Fix: Clarify help content or add to PAGE PERSONA
                            │
                            └── YES → Success!
```

**Common Navigation Failures:**

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Assistant tries to answer from memory instead of calling help | Preamble doesn't emphasize using help tool | Add to preamble: "For questions about how to use KH, always use the get_help tool" |
| Assistant calls help but can't find the answer | Topic not in help content | Add topic to appropriate help category |
| Assistant finds help but explains it wrong | Help content is ambiguous or assistant adds interpretation | Make help content more explicit, or add interpretation guidance to preamble |
| Assistant says "I don't know" when help exists | Help content not discoverable (bad title/summary) | Improve help topic titles and summaries |

### Analytical Questions (Data/Tools)

**Expected behavior:** Assistant selects appropriate tool → calls with correct inputs → interprets results for user

**Failure Tree:**

```
User asks about their data ("How many...", "Which articles...", "Summarize...")
    ↓
Did assistant call a tool?
    ├── NO → Problem: Didn't Recognize as Data Question
    │         Fix: Edit PAGE PERSONA to clarify available capabilities
    │
    └── YES → Was it the RIGHT tool?
                ├── NO → Problem: Wrong Tool Selection
                │         Fix: Edit PAGE PERSONA with guidance on which tool for which task
                │         Or: Check tool descriptions in Admin → Chat Config → Tools
                │
                └── YES → Were the inputs correct?
                            ├── NO → Problem: Bad Tool Inputs
                            │         Assistant misunderstood what to query
                            │         Fix: Clarify in PREAMBLE or PAGE PERSONA
                            │
                            └── YES → Did tool return expected data?
                                        ├── NO → Problem: Tool Bug
                                        │         Tool itself is broken
                                        │         Fix: Report to dev team with diagnostics
                                        │
                                        └── YES → Did assistant interpret correctly?
                                                    ├── NO → Problem: Interpretation
                                                    │         Fix: Add STREAM INSTRUCTIONS
                                                    │         or PAGE PERSONA guidance
                                                    │
                                                    └── YES → Success!
```

**Common Analytical Failures:**

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Assistant describes what it *would* do instead of doing it | Doesn't know tools are available | Edit page persona to list capabilities |
| Uses wrong tool for the task | Tool selection guidance unclear | Add guidance to page persona: "Use X for..., use Y for..." |
| Right tool, wrong parameters | Misunderstood user intent | Add to preamble: guidance on interpreting requests |
| Tool works but answer is wrong | Misinterprets domain-specific data | Add stream instructions with interpretation notes |
| Tool returns error | Tool bug or edge case | Check diagnostics, report to dev team |

---

## Part 3: Style and Behavior Failures

Some failures aren't about getting the wrong answer—they're about *how* the assistant responds.

| Symptom | Cause | Fix (add to GLOBAL PREAMBLE) |
|---------|-------|------------------------------|
| **Too verbose** | No brevity guidance | "Be concise. One paragraph unless more detail is requested." |
| **Too complimentary** | Default LLM behavior | "Don't praise the user or say things like 'Great question!'" |
| **Boastful about KH** | No guidance against it | "Don't boast about KH's capabilities." |
| **Over-explains reasoning** | LLM tendency to show work | "Don't explain your reasoning unless asked." |
| **Overconfident** | No uncertainty guidance | "When uncertain, say so. Don't present guesses as facts." |
| **Hallucination** | Answers without checking | "Only state facts you've verified via tools or help content." |
| **Asks too many questions** | Overly cautious | "Make reasonable interpretations rather than asking for clarification. Only ask when truly necessary." |
| **Over-eager, rushes to act** | No pause-and-think guidance | "Ensure you understand the request before acting." |

---

## Part 4: Using Diagnostics

When something goes wrong, diagnostics show you exactly what happened.

### Accessing Diagnostics

**In any chat conversation:** Look for the **bug icon** on messages. Click to open diagnostics.

**In Admin → Conversations:** Browse all user conversations. Click "View Full Trace" on any message.

### The Three Diagnostic Tabs

#### Messages Tab — What Happened Step by Step
- Full system prompt sent to the model
- Each iteration: what was sent, what the model responded
- Each tool call: name, inputs, outputs, timing

**Use this to answer:**
- Did it call the right tool?
- What did the tool return?
- Where did the reasoning go wrong?

#### Config Tab — What Was Available
- Model used
- Full system prompt (all layers combined)
- All available tools with descriptions

**Use this to answer:**
- Was the needed tool available?
- Did the prompt include necessary guidance?
- Were tool descriptions clear?

#### Metrics Tab — Performance
- Iterations used
- Token counts
- Timing
- Outcome (success/error/max_iterations)

**Use this to answer:**
- Did it hit limits?
- Performance issues?

### Quick Diagnosis Workflow

1. **Identify question type:** Was this Navigation or Analytical?
2. **Open diagnostics** for the message
3. **Check Messages tab:**
   - Navigation: Did it call `get_help`? What was returned?
   - Analytical: Which tool was called? What were inputs/outputs?
4. **Trace the failure** using the appropriate failure tree above
5. **Identify the fix:** Preamble? Page persona? Help content? Stream instructions?

---

## Part 5: Configuration Mechanics (Admin UI)

### Admin → Chat Config → System

**Global Preamble** — Foundation of all chat behavior

This is where you set universal rules that apply everywhere:
- Tone and style (concise, no flattery, no boasting)
- Uncertainty handling (admit when unsure)
- Ambiguity handling (interpret vs ask)
- Query classification hints (when to use help vs tools)

**Max Tool Iterations** — How many tool calls per request (default: 10)

### Admin → Chat Config → Pages

**Page Persona** — Per-page behavior

Each page (Reports, Streams, Tablizer, etc.) can have custom guidance:
- What users do on this page
- What tools/capabilities are available
- Page-specific interpretation rules

### Admin → Chat Config → Streams

**Stream Instructions** — Domain-specific context

For each research stream:
- What the stream is about
- Key terminology and meanings
- Interpretation priorities

### Admin → Chat Config → Help

**Help Content** — Documentation the assistant retrieves

Organized by category:
- `field-reference` — What fields mean (dates, scores, statuses)
- `glossary` — Term definitions
- `getting-started` — Onboarding
- `reports`, `streams`, etc. — Feature documentation

**When Navigation questions fail, this is usually what needs updating.**

### Admin → Chat Config → Tools

**View-only** — See what tools exist and their descriptions

Useful for understanding what capabilities the assistant has. Tool changes require code.

### Admin → Chat Config → Payloads

**View-only** — See data structures tools can return

---

## Part 6: Configuration Checklist

### Before Release

**Global Preamble includes:**
- [ ] Style rules (concise, no flattery, no boasting)
- [ ] Uncertainty guidance (admit when unsure, don't hallucinate)
- [ ] Ambiguity guidance (when to interpret vs ask)
- [ ] Query classification (when to use help vs data tools)

**Help Content covers:**
- [ ] All user-visible fields (Field Reference)
- [ ] Domain terms (Glossary)
- [ ] Common "how to" questions
- [ ] Each major feature area

**Page Personas include:**
- [ ] What users do on each page
- [ ] Available capabilities
- [ ] Tool selection guidance

**Testing completed:**
- [ ] Navigation queries return accurate help
- [ ] Analytical queries use correct tools
- [ ] Style is appropriate (not verbose/complimentary/boastful)
- [ ] Ambiguous queries handled gracefully

### When Issues Arise

1. [ ] Classify: Navigation or Analytical question?
2. [ ] Open diagnostics for the failing message
3. [ ] Walk through the appropriate failure tree
4. [ ] Identify fix: Preamble / Persona / Help / Stream Instructions
5. [ ] Make the fix
6. [ ] Test with similar queries
7. [ ] Monitor conversation history for recurrence

## APPENDIX

Criteria for chat being viable to release (from Adam)

Chat function should provide clear value to the user:
- Should be clear how to use it in general
- Should be clear how to use it next in context
- Should suggest next steps that would provide unexpected value to the user

Chat function should assist with the two key areas of usage:
- Should provide help in using the KH app
- Should provide help in working with/interpreting the user’s content

Chat function should feel like an enrichment of the core functionality
- not a requirement to get meaningful results from the core functionality 

Chat function should NOT draw attention to the types of common LLM issues that KH is supposed to be the antidote to
- Frustration with the AI in chat could undermine an amazing experience everywhere else in the app
- Common issues that must be avoided:
    - Overly verbose in general
    - Overly complimentary to the user
    - Overly boastful about KH
    - Over confident about it’s (sometimes subjective) answers
    - Overly explain the answer
    - Make up results/halucinate
    - Perform incorrectly when presented with ambiguous input
    - Overly quick to try to please without fully understanding the task
    - Overly prone to asking endless follow up clarification questions