# MVP Punch List: Toxicogenomica Release

**Target:** Initial release to Toxicogenomica group
**Status:** Draft
**Last Updated:** 2026-02-04

---

## 1. Chat System

### Goal

Dial in the chat system using existing levers to reach "good enough" quality.

### Levers

1. **Prompts** - System prompts, query classification, response style
2. **Tools** - Tool definitions, documentation, when/how they're used
3. **Help Content** - Documentation the LLM retrieves for navigation queries

### Define "Good Enough"

- [ ] Establish success criteria for chat quality
- [ ] Define test scenarios that must pass
- [ ] Identify failure modes we can tolerate vs. must fix

*Reference: [Chat System Critical Success Factors](../backend/docs/chat_system_critical_success_factors.md)*

### First Interaction UX

**What does the user see when starting a new chat (especially first time)?**

This is important for setting expectations and building trust.

- [ ] Define the greeting message
- [ ] Consider first-time vs. returning user experience
- [ ] Set appropriate expectations about capabilities/limitations

### Chat Icon

**Avoid associations with bad chat systems.**

The typical chat bubble icon carries baggage from frustrating chatbot experiences.

- [ ] Explore alternative icon options
- [ ] Consider what visual language conveys "helpful assistant" vs "annoying bot"

---

## 2. UX Polish

### Date Handling

Ensure date handling is correct throughout:

- [ ] Search side - dates used in queries are correct
- [ ] Display side - dates shown to users are correct
- [ ] Verify timezone handling
- [ ] Verify inclusive/exclusive boundary behavior

---

## 3. Test Script

### Key Functionality Test Script

Define a basic test script covering the functionality TG needs to work well.

- [ ] Identify key user workflows for TG
- [ ] Write test scenarios for each workflow
- [ ] Execute and document results

**Workflows to test:**
- [ ] _TODO: List specific TG workflows_

---

## Sign-off Checklist

- [ ] Chat "good enough" criteria met
- [ ] Date handling verified
- [ ] Test script passes
