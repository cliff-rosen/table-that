# Chat System Evaluation Report

**Date:** 2026-02-14
**Conversations evaluated:** 10 (#213 through #222)
**Framework:** Chat Quality Framework v1 (9 factors)
**Data source:** `chat_dump.json` via `dump_last_10_chats.py`

---

## Conversation #222 — Focused

**Page:** article_viewer | **Stream:** Asbestos and Talc Litigation | **Report:** Jan 25 - Jan 31 | **Role:** member
**Turns:** 4 | **Duration:** ~3 min

### Metrics Snapshot

| Turn | Query | Tool(s) Called | Iters | Peak Ctx | Cum In | Cum Out | Stop | Duration |
|------|-------|---------------|-------|----------|--------|---------|------|----------|
| 1 | Predict next week's alert article count | list_stream_reports | 2 | 7,201 | 13,875 | 393 | end_turn | 11.1s |
| 2 | How to sign up colleagues for alerts | get_help(user-roles) | 2 | 7,513 | 14,702 | 283 | end_turn | 7.6s |
| 3 | How to send note about an article | get_help(article-viewer/notes) | 2 | 7,639 | 15,064 | 356 | end_turn | 9.7s |
| 4 | Full text link not working | get_full_text | 2 | 7,919 | 15,654 | 350 | end_turn | 9.6s |

### Factor Scores

| Factor | Score | Notes |
|--------|-------|-------|
| 1. Context Accuracy | 3 | Article context fully populated (title, PMID, stance, summary) |
| 2. Instruction Quality | 2 | See finding F222-1 |
| 3. Adequate Toolset | 3 | All needed tools available |
| 4. Help Coverage | 3 | Both help lookups returned useful content |
| 5. Tool Presentation | 3 | Correct tool selection and parameters |
| 6. Query Classification | 2 | See finding F222-1 |
| 7. Context Budget | 3 | Peak 7,919 / 200k = 4.0% — no pressure |
| 8. Tool Result Quality | 3 | Results well-sized, actionable |
| 9. Error Recovery | N/T | No errors occurred |

### Findings

**F222-1 [INSTRUCTION_GAP]** Turn 1: The model first says "I don't have access to information about upcoming alerts or the ability to predict how many articles will be in next week's report" — then calls `list_stream_reports` and provides a data-based prediction. The initial disclaimer contradicts the final answer. The model should either answer directly or not answer; saying "I can't" and then doing it is confusing. The `[[tool:0]]` marker in the response shows the tool was called mid-response after the disclaimer text was already generated.

**F222-2 [GOOD_ROUTING]** Turns 2-3: Both how-to questions correctly routed to `get_help` with accurate category/topic parameters. Answers grounded in help content.

**F222-3 [GOOD_ROUTING]** Turn 4: Troubleshooting question correctly used `get_full_text` to check available links, then gave practical suggestions.

---

## Conversation #221 — Focused

**Page:** article_viewer | **Stream:** Asbestos and Talc Litigation | **Report:** Jan 25 - Jan 31 | **Role:** member
**Turns:** 2 | **Duration:** ~2 min

### Metrics Snapshot

| Turn | Query | Tool(s) Called | Iters | Peak Ctx | Cum In | Cum Out | Stop | Duration |
|------|-------|---------------|-------|----------|--------|---------|------|----------|
| 1 | Find recent CDKN2A mesothelioma article | search_pubmed ×3 | 4 | 8,194 | 29,208 | 638 | end_turn | 13.1s |
| 2 | Genetic variants driving mesothelioma | deep_research | 2 | 7,585 | 14,766 | 700 | end_turn | 56.1s |

### Factor Scores

| Factor | Score | Notes |
|--------|-------|-------|
| 1. Context Accuracy | 3 | Full article context |
| 2. Instruction Quality | 2 | See finding F221-2 |
| 3. Adequate Toolset | 3 | PubMed search + deep research available |
| 4. Help Coverage | N/T | No help lookups |
| 5. Tool Presentation | 3 | Good iterative search refinement |
| 6. Query Classification | 3 | Correct: both are data questions |
| 7. Context Budget | 3 | Peak 8,194 / 200k = 4.1% |
| 8. Tool Result Quality | 3 | PubMed results well-formatted; deep research returned structured summary |
| 9. Error Recovery | 3 | Turn 1: first search too narrow (1 result), second returned 0, third refined query found 313. Good recovery. |

### Findings

**F221-1 [GOOD_RECOVERY]** Turn 1: Model's initial search for "CDKN2A mesothelioma driver role recent" returned only 1 old result. Second attempt with date terms returned 0. Third attempt with proper boolean "CDKN2A" AND "mesothelioma" found 313 results. Good iterative refinement.

**F221-2 [INSTRUCTION_GAP]** Turn 2: Response includes "Would you like me to proceed with this comprehensive research on mesothelioma driver genetic variants?" followed immediately by `[[tool:0]]` — meaning the model asked permission but called the tool without waiting for a response. This is the exact issue fixed by updating the deep_research tool description from "ask before proceeding" to "inform the user that research is underway." This trace predates that fix.

**F221-3 [CONFAB]** Turn 2: After deep_research returns, the model produces a detailed breakdown of mutation frequencies (BAP1 40-60%, CDKN2A 70-80%, etc.) but the deep_research output_to_model only says "Deep research completed successfully" with a summary — the actual research content is in the frontend panel. The model appears to have generated these specific percentages from training data rather than from the tool output. The numbers may be correct, but they aren't grounded in the tool result.

---

## Conversation #220 — Single-topic

**Page:** article_viewer | **Stream:** Asbestos and Talc Litigation | **Report:** Jan 25 - Jan 31 | **Role:** member
**Turns:** 1 | **Duration:** ~11s

### Metrics Snapshot

| Turn | Query | Tool(s) Called | Iters | Peak Ctx | Cum In | Cum Out | Stop | Duration |
|------|-------|---------------|-------|----------|--------|---------|------|----------|
| 1 | How to find additional literature on genetic variants in ovarian cancer | search_pubmed | 2 | 7,801 | 14,577 | 439 | end_turn | 10.8s |

### Factor Scores

| Factor | Score | Notes |
|--------|-------|-------|
| 1. Context Accuracy | 3 | Article about ovarian cancer decision-making in context |
| 2. Instruction Quality | 3 | N/A — straightforward query |
| 3. Adequate Toolset | 3 | search_pubmed available |
| 4. Help Coverage | N/T | No help lookup needed |
| 5. Tool Presentation | 3 | Correct tool, good parameters |
| 6. Query Classification | 2 | See finding F220-1 |
| 7. Context Budget | 3 | Peak 7,801 / 200k = 3.9% |
| 8. Tool Result Quality | 3 | 501 results found, top 15 shown |
| 9. Error Recovery | N/T | No errors |

### Findings

**F220-1 [GOOD_ROUTING]** Turn 1: "How can I find additional literature" is ambiguous — could be a how-to question about using the platform, or a request to actually search. Given the article context (ovarian cancer), the model correctly treated it as a data request and searched PubMed. This was the right call, though a borderline case.

---

## Conversation #219 — Focused

**Page:** article_viewer | **Stream:** Asbestos and Talc Litigation | **Report:** Jan 25 - Jan 31 | **Role:** member
**Turns:** 2 | **Duration:** ~2 min

### Metrics Snapshot

| Turn | Query | Tool(s) Called | Iters | Peak Ctx | Cum In | Cum Out | Stop | Duration |
|------|-------|---------------|-------|----------|--------|---------|------|----------|
| 1 | How can defense counsel use this article in talc case | (none) | 1 | 6,794 | 6,794 | 509 | end_turn | 12.2s |
| 2 | Three cross-examination questions from this study | (none) | 1 | 7,324 | 7,324 | 472 | end_turn | 12.2s |

### Factor Scores

| Factor | Score | Notes |
|--------|-------|-------|
| 1. Context Accuracy | 3 | Article with stance analysis ("pro-defense") in context |
| 2. Instruction Quality | 3 | Model correctly used context without unnecessary tools |
| 3. Adequate Toolset | N/T | No tools needed — answered from context |
| 4. Help Coverage | N/T | N/A |
| 5. Tool Presentation | N/T | N/A |
| 6. Query Classification | 3 | Correctly identified as analysis-from-context |
| 7. Context Budget | 3 | Peak 7,324 / 200k = 3.7% |
| 8. Tool Result Quality | N/T | No tool results |
| 9. Error Recovery | N/T | No errors |

### Findings

**F219-1 [GOOD_ROUTING]** Both turns: Model answered complex legal/scientific analysis questions entirely from article context (title, abstract, stance analysis, relevance score). No unnecessary tool calls. Efficient single-iteration responses.

**F219-2 [CONFAB]** Turn 1: The model cites "up to 44% for BRCA1, up to 17% for BRCA2" lifetime risk — these specific percentages come from training data, not from the article context in the system prompt. The article is about decision-making around risk-reducing surgery, and while it involves BRCA carriers, the specific penetrance numbers aren't in the context. The analysis is reasonable but ungrounded for those specifics.

---

## Conversation #218 — Single-topic

**Page:** article_viewer | **Stream:** Asbestos and Talc Litigation | **Report:** Jan 25 - Jan 31 | **Role:** member
**Turns:** 1 | **Duration:** ~22s

### Metrics Snapshot

| Turn | Query | Tool(s) Called | Iters | Peak Ctx | Cum In | Cum Out | Stop | Duration |
|------|-------|---------------|-------|----------|--------|---------|------|----------|
| 1 | Defense rebuttal arguments for asbestosis vs IPF study | (none) | 1 | 6,820 | 6,820 | 892 | end_turn | 22.0s |

### Factor Scores

| Factor | Score | Notes |
|--------|-------|-------|
| 1. Context Accuracy | 3 | Article about asbestosis vs IPF comorbidity profiles in context |
| 2. Instruction Quality | 3 | Good — model provided litigation-relevant analysis |
| 3. Adequate Toolset | N/T | No tools needed |
| 4. Help Coverage | N/T | N/A |
| 5. Tool Presentation | N/T | N/A |
| 6. Query Classification | 3 | Correctly answered from article context |
| 7. Context Budget | 3 | Peak 6,820 / 200k = 3.4% |
| 8. Tool Result Quality | N/T | No tool results |
| 9. Error Recovery | N/T | No errors |

### Findings

**F218-1 [GOOD_ROUTING]** Answered entirely from article context. Produced an extremely thorough 12-point analysis with cross-examination questions. 892 output tokens — longest single response in the sample. No hallucinated tool calls.

---

## Conversation #217 — Focused

**Page:** reports (no stream/report selected) | **Role:** platform_admin
**Turns:** 2 | **Duration:** ~7 min (includes idle time)

### Metrics Snapshot

| Turn | Query | Tool(s) Called | Iters | Peak Ctx | Cum In | Cum Out | Stop | Duration |
|------|-------|---------------|-------|----------|--------|---------|------|----------|
| 1 | "hello" | (none) | 1 | 5,917 | 5,917 | 301 | end_turn | 7.1s |
| 2 | Show me available research streams | list_research_streams | 2 | 6,283 | 12,419 | 265 | end_turn | 6.9s |

### Factor Scores

| Factor | Score | Notes |
|--------|-------|-------|
| 1. Context Accuracy | 2 | See finding F217-1 |
| 2. Instruction Quality | 3 | Greeting handled well, data request routed correctly |
| 3. Adequate Toolset | 3 | list_research_streams available |
| 4. Help Coverage | N/T | No help needed |
| 5. Tool Presentation | 3 | Correct tool, correct params |
| 6. Query Classification | 3 | Greeting → overview; data request → tool call |
| 7. Context Budget | 3 | Peak 6,283 / 200k = 3.1%. Note: 12k system prompt vs 28k when report data loaded |
| 8. Tool Result Quality | 3 | Stream list clean and concise |
| 9. Error Recovery | N/T | No errors |

### Findings

**F217-1 [CONTEXT_GAP]** Turn 1: User is on reports page with no stream selected. Context accurately reflects this, but the system prompt is 12k chars (vs 28k when a report is loaded). The model correctly notes "you haven't selected a research stream yet." This is actually good context handling — minor gap is that the model doesn't know which streams the user has access to without calling a tool.

**F217-2 [GOOD_ROUTING]** Turn 2: "Show me available research streams" correctly calls `list_research_streams`, returns 3 streams with report counts. Clean response.

---

## Conversation #216 — Single-topic

**Page:** reports (with stream + report) | **Stream:** Asbestos and Talc Litigation | **Report:** Feb 01 - Feb 07 | **Role:** platform_admin
**Turns:** 1 | **Duration:** ~6s

### Metrics Snapshot

| Turn | Query | Tool(s) Called | Iters | Peak Ctx | Cum In | Cum Out | Stop | Duration |
|------|-------|---------------|-------|----------|--------|---------|------|----------|
| 1 | "hello" | (none) | 1 | 9,783 | 9,783 | 244 | end_turn | 6.1s |

### Factor Scores

| Factor | Score | Notes |
|--------|-------|-------|
| 1. Context Accuracy | 3 | Full report data loaded — executive summary, highlights, articles |
| 2. Instruction Quality | 3 | Greeting references current report and article count |
| 3. Adequate Toolset | N/T | No tools needed |
| 4. Help Coverage | N/T | N/A |
| 5. Tool Presentation | N/T | N/A |
| 6. Query Classification | 3 | Greeting handled appropriately |
| 7. Context Budget | 2 | See finding F216-1 |
| 8. Tool Result Quality | N/T | N/A |
| 9. Error Recovery | N/T | No errors |

### Findings

**F216-1 [BUDGET_PRESSURE]** System prompt is 27,744 chars / 9,783 tokens for a "hello." Compare with Conv #217 (same page, no report loaded): 12,013 chars / 5,917 tokens. The report data (exec summary, highlights, thematic analysis, category summaries, all 12 articles) doubles the context consumption. On first turn this is only 4.9% of the window, but multi-turn conversations on the reports page will hit the warning threshold much faster than article_viewer conversations.

---

## Conversation #215 — Multi-topic

**Page:** reports (with stream + report) | **Stream:** Asbestos and Talc Litigation | **Report:** Feb 01 - Feb 07 | **Role:** platform_admin
**Turns:** 4 (2 substantive + 2 social) | **Duration:** ~3 days (messages spread over Feb 9 - Feb 12)

### Metrics Snapshot

| Turn | Query | Tool(s) Called | Iters | Peak Ctx | Cum In | Cum Out | Stop | Duration |
|------|-------|---------------|-------|----------|--------|---------|------|----------|
| 1 | Was PMID 41512380 in a prior report? | search_articles_in_reports | 2 | 10,060 | 19,861 | 228 | end_turn | 6.5s |
| 2 | "thanks" | (none) | 1 | 10,012 | 10,012 | 25 | end_turn | 1.7s |
| 3 | Search for other articles like that first one | search_pubmed | 2 | 10,593 | 20,642 | 353 | end_turn | 11.1s |
| 4 | "thanks" | (none) | 1 | 10,360 | 10,360 | 31 | end_turn | 2.1s |

### Factor Scores

| Factor | Score | Notes |
|--------|-------|-------|
| 1. Context Accuracy | 3 | Report data fully loaded |
| 2. Instruction Quality | 2 | See finding F215-2 |
| 3. Adequate Toolset | 3 | Both search tools available and used |
| 4. Help Coverage | N/T | N/A |
| 5. Tool Presentation | 3 | Correct tools, correct params |
| 6. Query Classification | 3 | Both data questions correctly routed |
| 7. Context Budget | 2 | Reports page: peak 10,593 (5.3%) already elevated vs article_viewer |
| 8. Tool Result Quality | 3 | Concise, actionable results |
| 9. Error Recovery | N/T | No errors |

### Findings

**F215-1 [GOOD_ROUTING]** Turn 1: "Was PMID 41512380 in a prior report" — correctly used `search_articles_in_reports` with the PMID as query. Found the article in the Dec 28 - Jan 03 report. Clear, accurate answer.

**F215-2 [CONTEXT_GAP]** Turn 3: "Search for other articles like that first one" — ambiguous reference. The user likely means the PMID they asked about in Turn 1 (41512380, a multi-omic mesothelioma screening review). But the model interpreted "that first one" as the first article in the current report (a Wagner carbon fiber carcinogenicity study) and searched for "carbon nanotube carcinogenicity intraperitoneal mesothelioma rat fiber morphology." The conversation history should have made the reference clear, but the model anchored on the report data instead. This is a reference resolution failure — the model had the conversation history but chose the wrong antecedent.

---

## Conversation #214 — Single-topic

**Page:** reports (no stream/report selected) | **Role:** platform_admin
**Turns:** 1 | **Duration:** ~12s

### Metrics Snapshot

| Turn | Query | Tool(s) Called | Iters | Peak Ctx | Cum In | Cum Out | Stop | Duration |
|------|-------|---------------|-------|----------|--------|---------|------|----------|
| 1 | How do I change the name of a report? | get_help ×3 | 4 | 6,620 | 25,159 | 421 | end_turn | 11.8s |

### Factor Scores

| Factor | Score | Notes |
|--------|-------|-------|
| 1. Context Accuracy | 2 | No stream/report selected — context is sparse |
| 2. Instruction Quality | 3 | How-to question correctly routed to help |
| 3. Adequate Toolset | 3 | get_help available |
| 4. Help Coverage | 2 | See finding F214-1 |
| 5. Tool Presentation | 3 | Good progressive help drill-down |
| 6. Query Classification | 3 | Correctly identified as how-to |
| 7. Context Budget | 3 | Peak 6,620 / 200k = 3.3%. Cumulative 25k due to 4 iterations. |
| 8. Tool Result Quality | 2 | See finding F214-1 |
| 9. Error Recovery | N/T | No errors, but see F214-1 |

### Findings

**F214-1 [HELP_MISS / CONFAB]** Turn 1: The user asks "How do I change the name of a report?" The model searches help in 3 steps: (1) reports category TOC, (2) operations category TOC, (3) operations/approvals topic. None of these directly address report renaming. The help content for approvals says "Edit report metadata" as a bullet point but doesn't specifically mention renaming. The model synthesizes an answer: "you can change the report name through the Report Approvals process... Look for the option to edit report metadata." This may or may not be accurate — if the actual UI doesn't support renaming through the approval interface, this is confabulation filling in the help gap. The claim "once approved, the name typically cannot be changed" is also not in the help content.

---

## Conversation #213 — Focused

**Page:** artifacts | **Role:** platform_admin
**Turns:** 4 | **Duration:** ~2 min

### Metrics Snapshot

| Turn | Query | Tool(s) Called | Iters | Peak Ctx | Cum In | Cum Out | Stop | Duration |
|------|-------|---------------|-------|----------|--------|---------|------|----------|
| 1 | Add feature for prominent article alerts | (none — payload) | 1 | 8,543 | 8,543 | 447 | end_turn | 9.3s |
| 2 | Clear category and status of all items | (none — payload) | 1 | 8,692 | 8,692 | 446 | end_turn | 6.9s |
| 3 | "Let's identify new categories and propose assignments for" (incomplete) | (none) | 1 | 8,740 | 8,740 | 120 | end_turn | 4.3s |
| 4 | "analyze it" | (none — payload) | 1 | 8,865 | 8,865 | 567 | end_turn | 8.1s |

### Factor Scores

| Factor | Score | Notes |
|--------|-------|-------|
| 1. Context Accuracy | 3 | Artifacts list in context with all 8 items |
| 2. Instruction Quality | 3 | Artifacts page instructions work well |
| 3. Adequate Toolset | 3 | Artifact CRUD tools available (though used payloads, not direct tool calls) |
| 4. Help Coverage | N/T | No help needed |
| 5. Tool Presentation | N/T | No tool calls — all done via structured payloads |
| 6. Query Classification | 3 | All turns correctly handled as artifact management |
| 7. Context Budget | 3 | Peak 8,865 / 200k = 4.4% |
| 8. Tool Result Quality | N/T | No tool results |
| 9. Error Recovery | N/T | No errors |

### Findings

**F213-1 [GOOD_ROUTING]** All turns: The model correctly used structured payloads (artifact_changes) for create/update operations without making explicit tool calls. The artifacts page config enables this pattern — the model proposes changes as payloads and the frontend applies them. Efficient and appropriate.

**F213-2 [INSTRUCTION_GAP]** Turn 3: User sent an incomplete message ("let's identify new categories and propose assignments for"). The model correctly didn't proceed but could have prompted the user to complete their thought rather than saying "I'm ready to help!" and listing what it *could* do. Minor issue.

---

## Cross-Conversation Summary

### Aggregate Metrics

| Metric | Value |
|--------|-------|
| Total conversations | 10 |
| Total user turns | 22 |
| Turns with tool calls | 10 (45%) |
| Turns answered from context | 12 (55%) |
| Unique tools used | search_pubmed, get_help, list_stream_reports, list_research_streams, search_articles_in_reports, get_full_text, deep_research |
| Tool errors | 0 |
| Help misses | 0 explicit (1 partial — F214-1) |
| Truncations (max_tokens) | 0 |
| Max peak context | 10,593 tokens (5.3% of 200k) |
| Min peak context | 5,917 tokens (3.0%) |

### Factor Summary Across All Conversations

| Factor | Avg | Range | Key Issue |
|--------|-----|-------|-----------|
| 1. Context Accuracy | 2.8 | 2-3 | Reports page loads heavy context; article_viewer always solid |
| 2. Instruction Quality | 2.6 | 2-3 | "I can't do X" → then does X; incomplete message handling |
| 3. Adequate Toolset | 3.0 | 3-3 | No gaps observed in this sample |
| 4. Help Coverage | 2.5 | 2-3 | Report renaming help gap |
| 5. Tool Presentation | 3.0 | 3-3 | All tools used correctly |
| 6. Query Classification | 2.9 | 2-3 | One borderline case handled well |
| 7. Context Budget | 2.7 | 2-3 | Reports page 2x context vs article_viewer |
| 8. Tool Result Quality | 2.8 | 2-3 | One case of sparse help content |
| 9. Error Recovery | 3.0 | 3-3 | One good iterative refinement; no failures |

### Finding Category Distribution

| Code | Count | Conversations |
|------|-------|---------------|
| GOOD_ROUTING | 9 | #222, #220, #219, #218, #217, #215, #213 |
| GOOD_RECOVERY | 1 | #221 |
| INSTRUCTION_GAP | 3 | #222, #221, #213 |
| CONFAB | 2 | #221, #219 |
| CONTEXT_GAP | 2 | #217 (minor), #215 |
| BUDGET_PRESSURE | 1 | #216 |
| HELP_MISS | 1 | #214 |
| MISCLASS | 0 | — |
| TOOL_ERROR | 0 | — |
| TOOL_WRONG | 0 | — |
| TRUNCATED | 0 | — |
| RECOVERY_FAIL | 0 | — |
| PAYLOAD_FAIL | 0 | — |

### Priority Issues

1. **CONFAB after deep_research (F221-3):** When `deep_research` returns, the model receives a summary ("completed successfully, N sources") but the full research content goes to the frontend panel. The model then generates detailed analysis with specific statistics from training data rather than the tool output. This is a systemic issue — the model appears grounded but isn't.

2. **"I can't" → then does it (F222-1):** Model hedges with a disclaimer before calling a tool that answers the question. This undermines user confidence and creates a contradictory response.

3. **Reference resolution in multi-turn (F215-2):** "That first one" resolved to wrong antecedent. The model had conversation history but anchored on report data instead of conversation context.

4. **Reports page context budget (F216-1):** 28k system prompt chars for a reports page greeting vs 12-15k for article_viewer. This will compound over multi-turn conversations and hit the warning threshold sooner.

5. **Help gap for report management (F214-1):** No specific help topic for renaming/editing published reports. Model filled the gap with reasonable but unverified inference.
