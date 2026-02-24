# Reports Page Chat Requirements

This document defines expected chat behaviors on the Reports page based on our [Chat Assistance Philosophy](./chat-architecture.md#chat-assistance-philosophy).

---

## Context Levels

The reports page has two distinct contexts where chat is available:

| Context | What User Sees | Chat Focus |
|---------|---------------|------------|
| **Report Overview** | Report with executive summary, highlights, article list | Questions about the report as a whole |
| **Article Detail Modal** | Single article with abstract, stance analysis, notes | Questions about this specific article |

---

## Guide & Facilitate Use Cases

These are situations where chat helps the user **drive the application**—constructing queries, navigating, setting up features. Chat does the work, user approves.

### G1. Finding Specific Articles

| User Says | Expected Behavior | Required Support |
|-----------|-------------------|------------------|
| "Find articles about EGFR resistance" | Search across report articles, return results | `search_articles_in_reports` tool |
| "Which articles mention pembrolizumab?" | Search for drug name in titles/abstracts | `search_articles_in_reports` tool |
| "Show me the clinical trial articles" | Search for clinical trial indicators | `search_articles_in_reports` tool |

**Acceptance Criteria:**
- [ ] Chat uses search tool proactively
- [ ] Results include PMID, title, relevance score
- [ ] User can identify which article to open

### G2. Navigating Between Reports

| User Says | Expected Behavior | Required Support |
|-----------|-------------------|------------------|
| "What other reports are in this stream?" | List all reports with dates and article counts | `list_stream_reports` tool |
| "Show me last month's report" | Identify and describe the report from that date | `list_stream_reports` tool |
| "What's different from the previous report?" | Compare current report to prior one | `compare_reports` tool |

**Acceptance Criteria:**
- [ ] Chat lists reports with meaningful descriptions
- [ ] Comparison shows new/removed/shared article counts
- [ ] User understands what changed

### G3. Understanding Report Structure

| User Says | Expected Behavior | Required Support |
|-----------|-------------------|------------------|
| "What categories are in this report?" | List presentation categories with counts | Report data in context |
| "Give me an overview of this report" | Summarize executive summary, highlights, themes | `get_report_summary` tool or context |
| "What are the key takeaways?" | Present key highlights in digestible form | Report data in context |

**Acceptance Criteria:**
- [ ] Chat can describe report structure without tool calls (data in context)
- [ ] Summaries are accurate to what's displayed in UI

### G4. Working with Notes

| User Says | Expected Behavior | Required Support |
|-----------|-------------------|------------------|
| "What notes have been added to this article?" | Show all personal/shared notes | `get_notes_for_article` tool |
| "Are there any notes on the starred articles?" | Check notes across starred set | `get_starred_articles` + `get_notes_for_article` |

**Acceptance Criteria:**
- [ ] Notes show author and visibility (personal/shared)
- [ ] Chat respects note permissions

### G5. Tracking Important Articles

| User Says | Expected Behavior | Required Support |
|-----------|-------------------|------------------|
| "Show me my starred articles" | List all starred articles in stream | `get_starred_articles` tool |
| "Which articles have I marked as important?" | Same as above | `get_starred_articles` tool |

**Acceptance Criteria:**
- [ ] Returns starred articles with context (which report, relevance)

---

## Enhance Use Cases

These are situations where chat provides **intelligence beyond the UI**—analyzing data, finding patterns, synthesizing information.

### E1. Analyzing Article Content (Report Level)

| User Says | Expected Behavior | Required Support |
|-----------|-------------------|------------------|
| "What's the most common finding across these articles?" | Synthesize themes from abstracts | All article data in context |
| "Are there any contradictory findings?" | Identify conflicting conclusions | Article abstracts + relevance rationales |
| "What research gaps do these articles suggest?" | Analyze what's missing from the literature | Deep reading of abstracts |
| "Which articles have the strongest methodology?" | Evaluate based on abstract content | Article abstracts |

**Acceptance Criteria:**
- [ ] Chat has access to all article abstracts (up to 30 in context)
- [ ] Can synthesize across multiple articles
- [ ] Provides specific article citations for claims

### E2. Analyzing Article Content (Article Detail Level)

| User Says | Expected Behavior | Required Support |
|-----------|-------------------|------------------|
| "What is this article actually saying?" | Summarize in plain language | Full article in context |
| "Is this a strong study?" | Evaluate methodology from abstract | Article abstract |
| "What are the limitations mentioned?" | Extract limitations from abstract | Article abstract |
| "How does this relate to [topic]?" | Connect article to broader context | Article + domain knowledge |

**Acceptance Criteria:**
- [ ] Chat focuses on the current article when one is open
- [ ] Can provide detailed analysis of single article
- [ ] References specific parts of abstract

### E3. Statistical/Distribution Analysis

| User Says | Expected Behavior | Required Support |
|-----------|-------------------|------------------|
| "How many articles are from 2024?" | Count by publication year | Article metadata |
| "What journals appear most frequently?" | Distribution analysis | Article metadata |
| "What's the average relevance score?" | Calculate from scores | Relevance scores in context |
| "How many are categorized as [category]?" | Count by presentation category | Category assignments |

**Acceptance Criteria:**
- [ ] Chat can compute statistics from loaded data
- [ ] Answers are accurate to what's in the report

### E4. Stance/Position Analysis (Article Detail Level)

| User Says | Expected Behavior | Required Support |
|-----------|-------------------|------------------|
| "What position does this article take?" | Describe stance if available, or analyze abstract | Stance analysis in context |
| "Is this article supportive or critical of [therapy]?" | Analyze stance toward specific topic | Abstract + stance data |
| "What evidence does this article provide?" | Extract key evidence points | Abstract content |

**Acceptance Criteria:**
- [ ] If stance analysis exists, chat uses it
- [ ] If not, chat can analyze from abstract
- [ ] Clearly distinguishes between AI analysis and raw text

### E5. Cross-Report Analysis

| User Says | Expected Behavior | Required Support |
|-----------|-------------------|------------------|
| "What trends do you see across the last 3 reports?" | Analyze changes over time | `list_stream_reports` + `compare_reports` |
| "Is the research focus shifting?" | Identify topic evolution | Multiple report comparisons |
| "Are we seeing more or fewer articles on [topic]?" | Track topic prevalence | Search across reports |

**Acceptance Criteria:**
- [ ] Chat can reason across multiple reports
- [ ] Provides temporal context (when things changed)

---

## Edge Cases & Error Handling

### No Report Selected

| User Says | Expected Behavior |
|-----------|-------------------|
| Any report-specific question | "Please select a report first. I can see you have access to [stream name] - would you like me to list the available reports?" |

**Acceptance Criteria:**
- [ ] Chat recognizes missing context
- [ ] Offers actionable next step

### No Stream Selected

| User Says | Expected Behavior |
|-----------|-------------------|
| Any question | "I notice you haven't selected a research stream yet. Please select a stream to view its reports." |

**Acceptance Criteria:**
- [ ] Chat doesn't attempt tools that will fail
- [ ] Guides user to correct state

### Article Not Found

| User Says | Expected Behavior |
|-----------|-------------------|
| "Tell me about PMID 12345" (not in report) | "I couldn't find that article in this report. Would you like me to search for it across all reports in this stream?" |

**Acceptance Criteria:**
- [ ] Graceful failure with helpful suggestion
- [ ] Offers to expand search scope

### Question Beyond Data

| User Says | Expected Behavior |
|-----------|-------------------|
| "What will happen with this drug in 5 years?" | "I can't predict the future, but based on the current research trends in this report..." |
| "Should I invest in this company?" | "I can help you understand the research landscape, but I can't provide investment advice." |

**Acceptance Criteria:**
- [ ] Recognizes questions outside scope
- [ ] Redirects to what it CAN help with

---

## Context Requirements

### Report Overview Context Must Include:

```
- stream_id, stream_name
- report_id, report_name
- article_count
- executive_summary
- key_highlights
- thematic_analysis
- category_summaries
- articles (up to 30 with: title, authors, abstract, journal, year, relevance_score, relevance_rationale, category)
```

### Article Detail Context Must Include:

```
All of the above, PLUS:
- current_article:
  - article_id, pmid, doi
  - title, authors, journal, year
  - abstract (full)
  - relevance_score, relevance_rationale
  - stance_analysis (if run):
    - stance, confidence, analysis, key_factors
```

---

## Tool Requirements Summary

| Tool | Guide Use Cases | Enhance Use Cases |
|------|-----------------|-------------------|
| `list_stream_reports` | G2 | E5 |
| `get_report_summary` | G3 | - |
| `get_report_articles` | - | E1, E3 |
| `search_articles_in_reports` | G1 | E5 |
| `get_article_details` | - | E2 |
| `get_notes_for_article` | G4 | - |
| `compare_reports` | G2 | E5 |
| `get_starred_articles` | G5 | - |

---

## Missing Capabilities (Gaps to Evaluate)

### Potential Gaps in Guide Mode:

1. **No payload for navigation** - When chat finds an article, can user click to open it?
2. **No "open report" action** - Can chat help user switch to a different report?
3. **No filter application** - Can chat help filter the article list?
4. **No export assistance** - Can chat help export data?

### Potential Gaps in Enhance Mode:

1. **Full text access** - Chat only sees abstracts, not full text
2. **Citation network** - Can't see what articles cite each other
3. **Author analysis** - Can't easily analyze author patterns
4. **Temporal analysis** - Limited ability to track publication trends

### Potential UX Gaps:

1. **Chat doesn't know current UI state** - Pagination, sort order, filters applied
2. **No suggested actions for reports** - Chat can't offer "View this report" button
3. **Article modal chat is separate** - Context doesn't flow between page and modal chat

---

## Testing Scenarios

### Scenario 1: New User Exploring Report
```
1. User opens report for first time
2. User asks: "What is this report about?"
3. Expected: Chat summarizes executive summary and key themes
4. User asks: "What are the most important articles?"
5. Expected: Chat identifies high-relevance articles with rationale
```

### Scenario 2: Searching for Specific Topic
```
1. User has report open
2. User asks: "Find articles about immunotherapy"
3. Expected: Chat searches, returns relevant articles
4. User asks: "Tell me more about the first one"
5. Expected: Chat provides detail about that specific article
```

### Scenario 3: Analyzing Single Article
```
1. User opens article detail modal
2. User asks: "What is this study about?"
3. Expected: Chat summarizes abstract in plain language
4. User asks: "What are the key findings?"
5. Expected: Chat extracts main conclusions from abstract
6. User asks: "Is this relevant to my research on [topic]?"
7. Expected: Chat explains relevance based on relevance_rationale
```

### Scenario 4: Comparing Reports
```
1. User has current report open
2. User asks: "What's new since last report?"
3. Expected: Chat compares to previous report, shows new articles
4. User asks: "Are any important articles no longer appearing?"
5. Expected: Chat identifies removed articles
```

### Scenario 5: Cross-Article Analysis
```
1. User has report with 25 articles
2. User asks: "What patterns do you see across these articles?"
3. Expected: Chat synthesizes themes from all article abstracts
4. User asks: "Are there any contradictions?"
5. Expected: Chat identifies conflicting findings with citations
```

---

## Implementation Checklist

- [ ] All tools registered and functional
- [ ] Context builder provides complete data
- [ ] Report data loaded into system prompt
- [ ] Article detail context passed when modal open
- [ ] Error handling for missing context
- [ ] Graceful degradation when tools fail
- [ ] Suggested values/actions work correctly
- [ ] Payload handlers render results properly
