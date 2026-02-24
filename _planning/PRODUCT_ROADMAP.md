# KH Product Roadmap

**Status:** Draft
**Last Updated:** 2026-02-04

---

## Overview

This roadmap is organized into two main tracks:

1. **Stream Creation** - Workflows for defining and configuring research streams. Currently internal, but improving toward customer self-service.

2. **Stream Consumption** - Features for users consuming reports, analyzing articles, collaborating. This is the primary focus for initial customers like Toxicogenomica.

**Legend:**
- **Near-term** - Next 1-2 release cycles
- **Medium-term** - 2-4 release cycles
- **Long-term** - Future consideration

---

# Part 1: Stream Creation & Curation

## 1.1 Frictionless Stream Setup

**Goal:** Move along the spectrum from "only a developer with deep system knowledge can set up a stream" toward "anyone can do it with minimal training."

Everything we do here is about automating and reducing friction in the process of creating a stream with proper curation configuration.

This includes:
- Stream definition (goals, scope, sources)
- Query/retrieval configuration
- Curation criteria and categorization
- Testing and validation

---

## 1.2 Automatic Self-Improvement

**Goal:** The system learns and improves retrieval/curation automatically based on usage signals.

Inputs:
- Curation activity from report to report (what gets included/excluded)
- Curation notes (why curators made decisions)
- User feedback (explicit and implicit)

Outputs:
- Automatically refined retrieval configurations
- Improved filter thresholds
- Better categorization rules

---

# Part 2: Stream Consumption

*How users interact with reports, articles, and insights. Primary focus for Toxicogenomica.*

---

## 2.1 Full Text Retrieval

More robust functionality for retrieving and working with full article text.

---

## 2.2 Notes

More robust notes functionality, including notifications when others in your organization share notes.

---

## 2.3 Tablizer for Members

Make Tablizer available to regular members (not just admins/internal).

---

## 2.4 Library

Expand beyond curated reports to a full library of article collections. Users should be able to work with:

- Curated reports (existing)
- Custom lists (user-assembled)
- Search result lists (saved from queries)
- Any arbitrary article list

All of these should be collaborative and shareable within the organization.

---

## 2.5 Discovery

Enhanced capabilities for finding relevant articles:

- "More like this" - find similar articles
- Citation network - what does this cite, what cites this
- Author tracking - follow authors, see their new work
- Concept/topic alerts - notify when new articles match a concept

---

## 2.6 Analysis & Synthesis

Tools for deeper analysis across articles:

- Key quotes - collect excerpt quotes from articles in support of a point
- Cross-report trends - how is the literature evolving over time
- Synthesis - summarize what multiple articles say about a topic
- Evidence tables - structured extraction for systematic reviews

---

## 2.7 Additional Data Sources

Expand beyond PubMed and Google Scholar:

- Preprint servers (bioRxiv, medRxiv)
- Other databases (Scopus, Embase, Web of Science)
- Regulatory documents
- Patents

---

## 2.8 Chat Enhancements

TBD - ongoing improvements to:
- Tools
- Prompts
- Help system

---

# Part 3: Platform & Infrastructure

*Cross-cutting concerns*

### Near-term

- [ ] Performance monitoring
- [ ] Error tracking improvements

### Medium-term

- [ ] Usage analytics dashboard
- [ ] API rate limiting refinement
- [ ] Audit logging

### Long-term

- [ ] Multi-region deployment
- [ ] SOC 2 compliance
- [ ] On-premise deployment option

---

## Parking Lot

_Items that have been mentioned but need more definition:_

- _TODO: Add items from discussions that don't fit above_

---

## Version History

| Date | Author | Changes |
|------|--------|---------|
| 2026-02-04 | - | Initial draft - organized by creation vs consumption |
