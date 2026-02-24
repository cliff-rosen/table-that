# Making Generative AI Work: Principled Orchestration
by Cliff Rosen, Ironcliff Partners

## The Gap Between Potential and Reality

Everyone who has worked seriously with LLMs knows the pattern: stunning capability in demos, frustrating inconsistency in production. The model that brilliantly summarized a document yesterday produces something shallow today. The agent that handled ten queries flawlessly falls apart on the eleventh. Edge cases proliferate. Reliability remains elusive.

This isn't a matter of waiting for better models. The gap traces to specific architectural limitations—and understanding them points to the solution.

## The Memento Problem

In the film *Memento*, the protagonist can't form new memories. He's intelligent—capable of logical reasoning, solving problems, carrying on sophisticated conversations. But every few minutes, his slate is wiped clean. He has to reconstruct his understanding from notes, photographs, and tattoos he's left for himself. He can be manipulated by people who feed him misleading context, because he has no way to verify it against his own memory.

LLMs have the same condition.

Within a single interaction, they're powerful: logical, capable of sophisticated reasoning, able to synthesize information coherently. But they have no persistent memory across calls. Their context window is finite. They have no access to information unless it's explicitly provided. Every turn begins fresh with only what fits in the window.

This is architectural, not a bug the next release will fix.

The implication is profound: since you can't fit everything into the context window, you're forced to select a subset. And now you face the real challenge—how do you determine *which* subset? How do you ensure the model has exactly the context it needs for each decision, and not the wrong context, or missing context, or polluted context? Get this wrong and all the power of the LLM gets aimed in the wrong direction.

If the LLM is performing an output task—writing, summarizing, analyzing—you get a bad information asset. The output looks confident but is built on the wrong foundation. This is catchable if you have quality gates.

But it's worse when the LLM is functioning in its planning or reasoning capacity. The model doesn't know what it doesn't know. When it decides "I have enough information" or "I don't need to search for X," it makes that judgment with no awareness of what might be missing. It confidently skips the search it didn't know it needed. Now you've hit a branch in the decision tree and you're going a thousand miles an hour the wrong way. The error is invisible—the right step was never executed, so there's nothing to catch.

## The Cognitive Allocation Problem

Humans have two modes of thinking: fast and slow. Fast thinking handles routine tasks automatically. Slow thinking engages when something is complex—we pause, break things into parts, allocate more mental effort. Crucially, we know when to shift gears.

LLMs don't have this switch. They're always in fast-thinking mode. No matter what's required in the moment, they generate responses at the same pace, with the same approach. They can't recognize "this needs more thought" and slow down to give it more thought.

Reasoning models attempt to address this—they generate more "thinking" tokens before answering, which means more total compute. But there's a deeper problem: the model still has to *decide* whether to reason more. And that decision is made with the same limitations. It doesn't know what it doesn't know. It might confidently assess "this is straightforward" and be wrong.

You see this as the "do better" phenomenon: ask an LLM to write something, then simply say "improve that." It produces a better response—often significantly better. This reveals that the first response didn't use all the capability available in the model. Like a human giving a quick answer, the LLM satisfices rather than maximizes. It produces something reasonable, not something optimal.

You also see it in hidden intentions. A request like "make this email more professional and concise" contains implicit sub-decisions: What counts as professional? What information is essential versus removable? What tone is appropriate for this context? The model makes quick judgments about all of these without showing its work. Errors in these implicit steps go undetected—you only see the final output, not the reasoning that produced it.

The result: complex tasks get shallow treatment. The LLM has the capability to do better work, but the conditions don't allow it. Critical sub-decisions happen in passing rather than getting dedicated attention.

## The Grounding Problem

Everyone knows LLMs "hallucinate." But most people think of this as an occasional failure—the model sometimes makes things up. The reality is more fundamental: LLMs have no relationship to truth, only to plausibility.

The model generates statistically likely text given its input. It has no world model, no way to verify claims against reality, no internal representation of what's actually true versus what sounds true. When it produces correct information, it's because correct information was statistically likely given the training data and context—not because it checked.

This matters beyond the obvious "don't trust unverified facts" warning. It means the model can't serve as a source of ground truth for anything:

- **State tracking**: It can generate text that looks like it's tracking state ("I've completed steps 1 and 2, now moving to step 3"), but this is generated narrative, not actual state.
- **Branching decisions**: When a workflow needs to branch based on whether a condition is met, the model produces a plausible response, not a verified answer.
- **Verification**: It can generate text that looks like verification ("I've confirmed that X is correct"), but it's producing what confirmation would sound like.

The most familiar symptom is hallucination itself—the model states facts that aren't true, cites sources that don't exist, generates plausible-sounding nonsense. But the grounding problem goes deeper. You also see it as workflow drift: the model commits to an approach, then wanders or skips steps. The plan doesn't exist in any rigorous format—it exists as narrative. The LLM reorders, forgets, or abandons its own plan across turns because there's no actual plan underneath, just text about a plan.

This is architectural. The model produces what things *sound like*, not what they *are*.

## The Expertise Opportunity

These are limitations. But there's also an opportunity.

LLMs are powerful—in many cases they outperform humans at tasks we thought required deep expertise. But domain experts still have wisdom, intuition, and institutional knowledge that LLMs don't possess. The actuary who knows which edge cases matter. The underwriter who recognizes patterns the training data doesn't capture. The researcher who knows where to look and when to stop looking.

When you build LLM-powered systems, that expertise is at risk. If you let the model freestyle—give it a goal and primitive tools and hope for the best—you lose everything the humans know about how to do this well.

The opportunity is to reach for that expertise and encode it into the system itself.

## The Solution: Principled Orchestration

Three architectural problems. One opportunity. Both point to the same requirement: not a better prompt, but a designed system that accounts for what LLMs can and cannot do—and encodes what humans know. That system is orchestration.

Orchestration coordinates multiple prompts, models, and tools to achieve what single interactions cannot. But before diving into specifics, there's a key question that shapes everything: **who's orchestrating?**

Something has to decide what happens next. Do we have enough information? Did we decompose this problem correctly? Is the best next step to compile a final answer, or to review what we've gathered against the requirements? That decision-making can happen in two ways:

**The LLM decides.** You give it a goal and tools, and it figures out the path. This is flexible—it handles novel situations, adapts to what it discovers. But it's subject to all three problems we just described. The LLM doesn't know what it doesn't know. It can't ground its plans in reality. It may not allocate enough cognition to the decision about what to do next.

**An external system decides.** A designed workflow determines the sequence: step one, then step two, then step three. This is predictable, auditable, and—crucially—enforceable. The LLM has no ground truth; it can drift from its own plan. An external system actually tracks state and enforces what happens. But it's rigid—it can't adapt to situations the designer didn't anticipate.

The LLM can also serve as a **Worker**—executing discrete cognitive operations within whatever orchestration is happening. Summarize this document. Extract the key dates. Classify this claim. The system defines the task; the LLM executes it. This is where LLMs shine: focused, bounded work with clear inputs and outputs.

The real power comes from combining these roles intelligently—and this is where the three problems become design constraints rather than unsolvable obstacles.

When the LLM works as a focused Worker, the Memento problem is manageable: you curate exactly the context it needs for that specific operation, nothing more. When an external system handles planning, the Grounding problem is contained: state and control flow live in code that actually tracks reality, not in generated narrative. When you decompose work into explicit steps, the Cognitive Allocation problem is addressed: each step gets dedicated attention rather than being one of many things juggled simultaneously.

### Encoding Intelligence From Above and Below

The design of the system—what calls what, with what context, in what sequence—is where the real intelligence lives. Human expertise gets encoded from two directions:

**From above**—in workflow design. Consider a claims processing system. The outer workflow is fixed: receive claim, validate format, assess coverage, calculate payout, generate decision letter. This sequence is locked for compliance and auditability. The LLM doesn't decide the process; it operates within a process that embeds institutional knowledge. But "assess coverage" might require research and judgment about ambiguous situations—that step invokes an agent with flexibility to investigate. The outer workflow knows *what* it needs; it delegates *how* to an LLM that can adapt.

**From below**—in tool abstraction. Consider a customer service agent handling open-ended requests—it can't predict what users will ask. But when the agent determines the user needs a policy summary, it doesn't improvise one. It calls a `generate_policy_summary` tool that runs a proven pipeline internally. The expertise is in the tool; the LLM just invokes it. The agent chooses *whether* to research; the *how* is handled by something reliable.

Choose the top level based on the domain. Regulated processes want deterministic orchestration for auditability. Customer-facing interfaces need agentic flexibility. Either way, the LLM executes focused operations; the encoded intelligence guides the overall work.

### Principles for Getting This Right

Putting this into practice requires attention to how you decompose work, manage context, and maintain control. Each principle addresses one or more of the architectural problems:

**1. Decompose into explicit steps.** Don't let critical decisions happen in passing. Force slow thinking by making each decision a dedicated step with focused context. *(Addresses Cognitive Allocation.)*

**2. Curate sterile context.** Each step gets exactly what it needs—not accumulated conversation history, not everything that might be relevant, but precisely what this operation requires. *(Addresses Memento.)*

**3. Externalize state and control flow.** Loops, counters, progress tracking, and conditional logic live outside the LLM. The system tracks reality; the LLM reasons about language and content. *(Addresses Grounding.)*

**4. Bound before delegating.** Agentic freedom exists inside constrained containers. The caller limits scope before handing off. *(Contains all three problems within manageable boundaries.)*

**5. Encode expertise in tool abstraction.** Higher-level tools encode "the right way to do this." A research tool that internally handles query formulation, result evaluation, and gap analysis reduces the LLM's decision surface and makes the happy path the default. *(Captures the Expertise Opportunity.)*

**6. Quality gates at critical junctions.** Verify outputs *and* strategic decisions before proceeding. Don't trust the model's self-assessment that it has enough information or made the right choice. *(Catches failures from all three problems before they propagate.)*

## Example: Research Done Right

Consider a research task: answering a complex question that requires gathering and synthesizing information from multiple sources. In principle, you could give an LLM a search tool and a goal. Let it figure out what to search, evaluate what it finds, and compile an answer.

It will produce something. But it will be unreliable. The model will satisfice—stopping when it has a plausible answer rather than a complete one. It will miss gaps it didn't know to look for. It may contradict itself across sources without noticing. The Memento, Cognitive Allocation, and Grounding problems will all manifest.

Here's how orchestration handles it:

**Phase 1: Clarification**

Before any research begins, clarify what's actually being asked. The system takes the user's question and generates a disambiguated version: "I'll compare X and Y across these dimensions. Should I focus on any specific aspects?"

This is a quality gate with human validation. It catches misunderstandings before they propagate through the entire workflow. The LLM works as a focused Worker—its only job is to surface ambiguity and propose clarification.

**Phase 2: Requirements Analysis**

Generate an explicit checklist of what a complete answer requires. For a comparison question, this might include: performance benchmarks, pricing, availability, version information. The checklist makes hidden intentions visible—instead of the model implicitly deciding what matters, the requirements are explicit and inspectable.

This addresses Cognitive Allocation directly. The question "what makes a good answer?" gets dedicated attention as its own step, rather than being one of many things the model juggles while also researching and writing.

**Phase 3: Iterative Retrieval**

Now research happens—but in a structured loop, not a freestyle exploration.

The system maintains a **knowledge base** as an explicit data structure outside the LLM. This is crucial: the knowledge base is actual state, not narrative about state. It can be inspected, queried, and verified.

Each iteration:
1. **Gap analysis**: Compare current knowledge base against the requirements checklist. What's missing?
2. **Query generation**: For each gap, generate targeted search queries.
3. **Retrieval and evaluation**: Execute searches, evaluate results against the specific information need.
4. **Integration**: Add new information to the knowledge base. Flag conflicts—if two sources disagree, note both rather than silently picking one.
5. **Completeness check**: Does the knowledge base now satisfy the requirements? If not, iterate.

The loop continues until requirements are met or a maximum iteration count is reached. The exit condition is explicit and verifiable, not a vibes-based judgment that "we probably have enough."

Notice what's externalized: the knowledge base, the requirements checklist, the iteration count, the completeness evaluation. The LLM performs cognitive operations—analyzing gaps, generating queries, evaluating relevance—but the control flow and state live in the system.

**Phase 4: Synthesis**

Only after the knowledge base is sufficiently complete does synthesis happen. The synthesizer receives: the clarified question, the requirements checklist, and the populated knowledge base. Its job is focused: produce a coherent answer from verified materials.

Because the knowledge base tracks sources, the answer can include citations. Because conflicts were flagged during retrieval, the synthesis can acknowledge uncertainty rather than papering over it.

**What This Demonstrates**

The phases are fixed—this is encoding expertise "from above." An expert researcher clarifies the question, figures out what they need, gathers systematically, and only then writes. The orchestration makes that expertise executable.

The individual operations leverage LLM capability—this is the Worker role. Gap analysis, query generation, relevance evaluation, synthesis: these are cognitive tasks where the model excels. But each is bounded and focused.

The tools encode best practices—this is expertise "from below." The gap analyzer, the query generator, the completeness checker: each can be its own optimized pipeline. The orchestrating layer doesn't need to know how gap analysis works, only that it can invoke it.

The knowledge base is external state addressing the Grounding problem. The explicit checklist addresses Cognitive Allocation. The curated context for each step addresses Memento. The quality gates—human clarification, completeness checks, conflict detection—prevent errors from propagating silently.

## What Changes

Systems built on principled orchestration work consistently, not occasionally. When something fails, you know which step broke and why—you fix that step, not the whole system. The failure is localized and debuggable. For regulated industries, the path is explicit and logged; the audit trail exists because the architecture creates it.

Most importantly: the latent capability is already in the model. Orchestration is how you extract it. The same LLM that produces shallow single-turn answers will produce rigorous, well-sourced analysis when the system structure demands it—when each sub-task gets focused attention, when state is tracked externally, when quality gates enforce standards.

---

The technology is powerful. The orchestration architecture determines whether that power translates to reliable value. The model isn't the bottleneck—the usage pattern is.
