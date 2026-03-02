"""
Deep Research & Coercion Tests

Section 1: Pure unit tests for coerce.py (no API calls)
Section 2: Lookup accuracy — verify factual answers + trace quality
Section 3: Research trace quality — compare modes, synthesis, edge cases
Section 4: Strategy integration — full execute_one() with template interpolation + coercion

Run:
    cd backend
    python -m pytest tests/test_research_deep.py -v -s

Then browse: tests/results/research_deep_results.md
"""

import logging
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List

import pytest

from database import AsyncSessionLocal
from schemas.table import ColumnDefinition, RowCreate, TableCreate
from services.row_service import RowService
from services.table_service import TableService
from tests.helpers import FlowResultsWriter, StepRecord

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────
TEST_USER_ID = 1  # cliff.rosen@gmail.com

SECTION_1 = "1. Coercion Unit Tests"
SECTION_2 = "2. Lookup Accuracy"
SECTION_3 = "3. Research Trace Quality"
SECTION_4 = "4. Strategy Integration"

RESULTS_FILE = Path(__file__).parent / "results" / "research_deep_results.md"


# ═══════════════════════════════════════════════════════════════════════════
# Helpers (copied from test_tools.py)
# ═══════════════════════════════════════════════════════════════════════════


@asynccontextmanager
async def fresh_session():
    """Create and close a DB session, retrying once on stale connections."""
    session = AsyncSessionLocal()
    try:
        yield session
    finally:
        try:
            await session.close()
        except Exception:
            pass


async def run_with_session(fn):
    """Run fn(session) with retry on stale connection errors."""
    for attempt in range(2):
        async with fresh_session() as session:
            try:
                return await fn(session)
            except AttributeError as e:
                if "'send'" in str(e) and attempt == 0:
                    continue
                raise
            except Exception as e:
                if "Event loop is closed" in str(e) and attempt == 0:
                    continue
                raise
    return None


async def _collect_steps(async_gen) -> List[Dict[str, Any]]:
    """Consume an async generator, collecting all yielded dicts."""
    steps = []
    async for step in async_gen:
        steps.append(step)
    return steps


async def _collect_row_steps(async_gen):
    """Consume a strategy's execute_one, collecting RowStep objects."""
    steps = []
    async for step in async_gen:
        steps.append(step)
    return steps


# ═══════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════

_shared_table = None


async def _create_test_table():
    """Create a temp table + seed rows. Returns (table, row_ids)."""
    async with fresh_session() as session:
        table_service = TableService(session)
        row_service = RowService(session)

        table = await table_service.create(
            user_id=TEST_USER_ID,
            data=TableCreate(
                name="__test_research_deep__",
                description="Temp table for deep research tests",
                columns=[
                    ColumnDefinition(id="col_name", name="Name", type="text", required=True),
                    ColumnDefinition(id="col_founded", name="Founded", type="text"),
                    ColumnDefinition(
                        id="col_industry",
                        name="Industry",
                        type="select",
                        options=["Tech", "Finance", "Healthcare"],
                    ),
                ],
            ),
        )

        seeds = [
            {"col_name": "Anthropic", "col_founded": "2021", "col_industry": "Tech"},
            {"col_name": "Stripe", "col_founded": "2010", "col_industry": "Finance"},
            {"col_name": "Moderna", "col_founded": "2010", "col_industry": "Healthcare"},
        ]
        row_ids = []
        for data in seeds:
            row = await row_service.create(table.id, RowCreate(data=data))
            row_ids.append(row.id)

    return table, row_ids


async def _delete_test_table(table_id: int):
    """Delete a test table by ID."""
    async with fresh_session() as session:
        try:
            table_service = TableService(session)
            await table_service.delete(table_id, TEST_USER_ID)
        except Exception:
            pass


@pytest.fixture(scope="module")
def results(request):
    """Module-scoped results writer — writes markdown on teardown, cleans up test table."""
    writer = FlowResultsWriter(
        RESULTS_FILE,
        title="Deep Research & Coercion Test Results",
    )
    writer.set_sections([SECTION_1, SECTION_2, SECTION_3, SECTION_4])
    yield writer
    writer.write()

    # Clean up shared test table
    import asyncio

    async def cleanup():
        global _shared_table
        if _shared_table is not None:
            table, _ = _shared_table
            await _delete_test_table(table.id)
            _shared_table = None

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(cleanup())
        else:
            loop.run_until_complete(cleanup())
    except RuntimeError:
        asyncio.run(cleanup())


@pytest.fixture
async def test_table():
    """Lazily create a shared test table on first use, reuse for all tests."""
    global _shared_table
    if _shared_table is None:
        _shared_table = await _create_test_table()
    return _shared_table


# ═══════════════════════════════════════════════════════════════════════════
# Section 1: Coercion Unit Tests (no API calls)
# ═══════════════════════════════════════════════════════════════════════════


class TestCoercionUnit:
    """Pure unit tests for strategies/coerce.py — instant, no network."""

    # ── Preamble stripping ────────────────────────────────────────────────

    def test_preamble_research_answer(self, results):
        results.start_test(
            "preamble: 'Based on my research, the answer is 1998'",
            SECTION_1,
            '"Based on my research, the answer is 1998"',
        )
        from tools.builtin.strategies.coerce import strip_preamble

        out = strip_preamble("Based on my research, the answer is 1998")
        results.set_output(out)
        results.set_passed(out == "1998")
        results.finish_test()

    def test_preamble_quoted_url(self, results):
        results.start_test(
            "preamble: quoted URL",
            SECTION_1,
            '"\"https://anthropic.com\""',
        )
        from tools.builtin.strategies.coerce import strip_preamble

        out = strip_preamble('"https://anthropic.com"')
        results.set_output(out)
        results.set_passed(out == "https://anthropic.com")
        results.finish_test()

    def test_preamble_clean_passthrough(self, results):
        results.start_test(
            "preamble: clean input not mangled",
            SECTION_1,
            '"42"',
        )
        from tools.builtin.strategies.coerce import strip_preamble

        out = strip_preamble("42")
        results.set_output(out)
        results.set_passed(out == "42")
        results.finish_test()

    # ── Not-found detection ───────────────────────────────────────────────

    def test_not_found_sentinels(self, results):
        results.start_test(
            "not-found: sentinel values",
            SECTION_1,
            'check N/A, not found, "", Unknown',
        )
        from tools.builtin.strategies.coerce import is_not_found

        sentinels = ["N/A", "not found", "", "Unknown"]
        all_detected = all(is_not_found(s) for s in sentinels)
        results.set_output(f"All sentinels detected: {all_detected}")
        results.set_passed(all_detected)
        results.finish_test()

    def test_not_found_valid_values(self, results):
        results.start_test(
            "not-found: valid values not flagged",
            SECTION_1,
            'check "1998", "Some answer"',
        )
        from tools.builtin.strategies.coerce import is_not_found

        valid = ["1998", "Some answer"]
        none_flagged = not any(is_not_found(v) for v in valid)
        results.set_output(f"No valid values flagged: {none_flagged}")
        results.set_passed(none_flagged)
        results.finish_test()

    # ── Type coercion: number ─────────────────────────────────────────────

    def test_coerce_number_currency(self, results):
        results.start_test(
            "coerce number: '$1,234.56'",
            SECTION_1,
            '"$1,234.56" → number column',
        )
        from tools.builtin.strategies.coerce import coerce_value

        val, conf = coerce_value("$1,234.56", "number")
        results.set_output(f"value={val!r}, confidence={conf}")
        # After stripping $ and commas, "1234.56" == extracted number → "high"
        results.set_passed(val == "1234.56" and conf == "high")
        results.finish_test()

    def test_coerce_number_clean(self, results):
        results.start_test(
            "coerce number: '42'",
            SECTION_1,
            '"42" → number column',
        )
        from tools.builtin.strategies.coerce import coerce_value

        val, conf = coerce_value("42", "number")
        results.set_output(f"value={val!r}, confidence={conf}")
        results.set_passed(val == "42" and conf == "high")
        results.finish_test()

    # ── Type coercion: boolean ────────────────────────────────────────────

    def test_coerce_boolean_yes(self, results):
        results.start_test(
            "coerce boolean: 'Yes'",
            SECTION_1,
            '"Yes" → boolean column',
        )
        from tools.builtin.strategies.coerce import coerce_value

        val, conf = coerce_value("Yes", "boolean")
        results.set_output(f"value={val!r}, confidence={conf}")
        results.set_passed(val == "true" and conf == "high")
        results.finish_test()

    def test_coerce_boolean_no(self, results):
        results.start_test(
            "coerce boolean: 'no'",
            SECTION_1,
            '"no" → boolean column',
        )
        from tools.builtin.strategies.coerce import coerce_value

        val, conf = coerce_value("no", "boolean")
        results.set_output(f"value={val!r}, confidence={conf}")
        results.set_passed(val == "false" and conf == "high")
        results.finish_test()

    # ── Type coercion: select ─────────────────────────────────────────────

    def test_coerce_select_exact(self, results):
        results.start_test(
            "coerce select: exact match 'Tech'",
            SECTION_1,
            '"Tech" from ["Tech","Finance"]',
        )
        from tools.builtin.strategies.coerce import coerce_value

        val, conf = coerce_value("Tech", "select", ["Tech", "Finance"])
        results.set_output(f"value={val!r}, confidence={conf}")
        results.set_passed(val == "Tech" and conf == "high")
        results.finish_test()

    def test_coerce_select_fuzzy(self, results):
        results.start_test(
            "coerce select: fuzzy 'Technology'",
            SECTION_1,
            '"Technology" from ["Tech","Finance"]',
        )
        from tools.builtin.strategies.coerce import coerce_value

        val, conf = coerce_value("Technology", "select", ["Tech", "Finance"])
        results.set_output(f"value={val!r}, confidence={conf}")
        results.set_passed(val == "Tech" and conf == "medium")
        results.finish_test()

    def test_coerce_select_miss(self, results):
        results.start_test(
            "coerce select: miss 'Aerospace'",
            SECTION_1,
            '"Aerospace" from ["Tech","Finance"]',
        )
        from tools.builtin.strategies.coerce import coerce_value

        val, conf = coerce_value("Aerospace", "select", ["Tech", "Finance"])
        results.set_output(f"value={val!r}, confidence={conf}")
        results.set_passed(val == "Aerospace" and conf == "low")
        results.finish_test()

    # ── Coerce not-found produces empty ───────────────────────────────────

    def test_coerce_not_found_empty(self, results):
        results.start_test(
            "coerce: not-found sentinel → empty",
            SECTION_1,
            '"N/A" → text column',
        )
        from tools.builtin.strategies.coerce import coerce_value

        val, conf = coerce_value("N/A", "text")
        results.set_output(f"value={val!r}, confidence={conf}")
        results.set_passed(val == "" and conf == "none")
        results.finish_test()

    def test_coerce_preamble_then_number(self, results):
        results.start_test(
            "coerce: preamble + number",
            SECTION_1,
            '"The answer is 42" → number column',
        )
        from tools.builtin.strategies.coerce import coerce_value

        val, conf = coerce_value("The answer is 42", "number")
        results.set_output(f"value={val!r}, confidence={conf}")
        # Preamble should be stripped first, then number extracted
        results.set_passed(val == "42")
        results.finish_test()


# ═══════════════════════════════════════════════════════════════════════════
# Section 2: Lookup Accuracy (calls web APIs)
# ═══════════════════════════════════════════════════════════════════════════


class TestLookupAccuracy:
    """Call _lookup_web_core with known-answer questions and verify facts + trace."""

    async def test_lookup_google_founded(self, db, results):
        results.start_test(
            "lookup: Google founded year",
            SECTION_2,
            'question="What year was Google founded?"',
        )
        try:
            from tools.builtin.web import _lookup_web_core

            steps = await _collect_steps(
                _lookup_web_core("What year was Google founded?", 2, db, TEST_USER_ID)
            )
            for s in steps:
                detail = s.get("detail", s.get("query", s.get("text", "")))
                results.add_step(s["action"], str(detail))

            answer = next((s for s in steps if s["action"] == "answer"), None)
            answer_text = answer.get("text", "") if answer else ""
            results.set_output(answer_text)

            has_search = any(s["action"] == "search" for s in steps)
            has_answer = answer is not None
            results.set_passed(
                has_search and has_answer and "1998" in str(answer_text)
            )
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_lookup_capital_japan(self, db, results):
        results.start_test(
            "lookup: capital of Japan",
            SECTION_2,
            'question="What is the capital of Japan?"',
        )
        try:
            from tools.builtin.web import _lookup_web_core

            steps = await _collect_steps(
                _lookup_web_core("What is the capital of Japan?", 2, db, TEST_USER_ID)
            )
            for s in steps:
                detail = s.get("detail", s.get("query", s.get("text", "")))
                results.add_step(s["action"], str(detail))

            answer = next((s for s in steps if s["action"] == "answer"), None)
            answer_text = answer.get("text", "") if answer else ""
            results.set_output(answer_text)

            has_search = any(s["action"] == "search" for s in steps)
            results.set_passed(
                has_search and "Tokyo" in str(answer_text)
            )
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_lookup_gold_symbol(self, db, results):
        results.start_test(
            "lookup: chemical symbol for gold",
            SECTION_2,
            'question="What is the chemical symbol for gold?"',
        )
        try:
            from tools.builtin.web import _lookup_web_core

            steps = await _collect_steps(
                _lookup_web_core("What is the chemical symbol for gold?", 2, db, TEST_USER_ID)
            )
            for s in steps:
                detail = s.get("detail", s.get("query", s.get("text", "")))
                results.add_step(s["action"], str(detail))

            answer = next((s for s in steps if s["action"] == "answer"), None)
            answer_text = answer.get("text", "") if answer else ""
            results.set_output(answer_text)

            has_search = any(s["action"] == "search" for s in steps)
            results.set_passed(
                has_search and "Au" in str(answer_text)
            )
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_lookup_microsoft_ceo(self, db, results):
        results.start_test(
            "lookup: CEO of Microsoft",
            SECTION_2,
            'question="Who is the CEO of Microsoft?"',
        )
        try:
            from tools.builtin.web import _lookup_web_core

            steps = await _collect_steps(
                _lookup_web_core("Who is the CEO of Microsoft?", 2, db, TEST_USER_ID)
            )
            for s in steps:
                detail = s.get("detail", s.get("query", s.get("text", "")))
                results.add_step(s["action"], str(detail))

            answer = next((s for s in steps if s["action"] == "answer"), None)
            answer_text = answer.get("text", "") if answer else ""
            results.set_output(answer_text)

            has_search = any(s["action"] == "search" for s in steps)
            results.set_passed(
                has_search and "Nadella" in str(answer_text)
            )
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()


# ═══════════════════════════════════════════════════════════════════════════
# Section 3: Research Trace Quality (calls web APIs)
# ═══════════════════════════════════════════════════════════════════════════


class TestResearchTraceQuality:
    """Verify research trace structure, mode differences, and synthesis quality."""

    async def test_exploratory_vs_comprehensive(self, db, results):
        """Same question in both modes — comprehensive should have more steps and ≥1 fetch."""
        results.start_test(
            "research: exploratory vs comprehensive",
            SECTION_3,
            'query="What does Anthropic make?" — both modes compared',
        )
        try:
            from tools.builtin.web import _research_web_core

            query = "What does Anthropic make?"

            # Run exploratory (fewer steps)
            exp_steps = await _collect_steps(
                _research_web_core(query, 3, db, TEST_USER_ID, thoroughness="exploratory")
            )
            exp_answer = next((s for s in exp_steps if s["action"] == "answer"), None)
            exp_answer_text = exp_answer.get("text", "") if exp_answer else ""
            exp_searches = sum(1 for s in exp_steps if s["action"] == "search")
            exp_fetches = sum(1 for s in exp_steps if s["action"] == "fetch")

            results.add_step("exploratory_answer", exp_answer_text[:200])
            results.add_step("exploratory_stats", f"{exp_searches} searches, {exp_fetches} fetches")

            # Run comprehensive (more steps)
            comp_steps = await _collect_steps(
                _research_web_core(query, 8, db, TEST_USER_ID, thoroughness="comprehensive")
            )
            comp_answer = next((s for s in comp_steps if s["action"] == "answer"), None)
            comp_answer_text = comp_answer.get("text", "") if comp_answer else ""
            comp_searches = sum(1 for s in comp_steps if s["action"] == "search")
            comp_fetches = sum(1 for s in comp_steps if s["action"] == "fetch")

            results.add_step("comprehensive_answer", comp_answer_text[:200])
            results.add_step("comprehensive_stats", f"{comp_searches} searches, {comp_fetches} fetches")

            results.set_output(
                f"Exploratory: {exp_searches}s/{exp_fetches}f, "
                f"Comprehensive: {comp_searches}s/{comp_fetches}f"
            )

            # Both should mention Claude
            exp_has_claude = "Claude" in str(exp_answer_text) or "claude" in str(exp_answer_text).lower()
            comp_has_claude = "Claude" in str(comp_answer_text) or "claude" in str(comp_answer_text).lower()
            # Comprehensive should have more search steps
            comp_has_more = comp_searches > exp_searches
            # Comprehensive should have at least 1 fetch
            comp_has_fetch = comp_fetches >= 1

            passed = exp_has_claude and comp_has_claude and comp_has_more and comp_has_fetch
            if not passed:
                details = []
                if not exp_has_claude:
                    details.append("exp missing 'Claude'")
                if not comp_has_claude:
                    details.append("comp missing 'Claude'")
                if not comp_has_more:
                    details.append(f"comp not more searches ({comp_searches} <= {exp_searches})")
                if not comp_has_fetch:
                    details.append("comp has no fetches")
                results.add_step("failure_reason", "; ".join(details))

            results.set_passed(passed)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_multi_part_synthesis(self, db, results):
        """Research should synthesize multi-part answers with ≥3 relevant keywords."""
        results.start_test(
            "research: multi-part synthesis",
            SECTION_3,
            'query="Main programming languages for web development?"',
        )
        try:
            from tools.builtin.web import _research_web_core

            steps = await _collect_steps(
                _research_web_core(
                    "Main programming languages for web development?",
                    5, db, TEST_USER_ID, thoroughness="exploratory",
                )
            )
            for s in steps:
                detail = s.get("detail", s.get("query", s.get("url", s.get("text", ""))))
                results.add_step(s["action"], str(detail)[:200])

            answer = next((s for s in steps if s["action"] == "answer"), None)
            answer_text = str(answer.get("text", "")) if answer else ""
            results.set_output(answer_text)

            # Should contain at least 3 of these languages
            keywords = ["JavaScript", "Python", "HTML", "CSS", "TypeScript", "PHP"]
            found = [kw for kw in keywords if kw.lower() in answer_text.lower()]
            results.add_step("found_keywords", ", ".join(found))

            results.set_passed(len(found) >= 3)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_numeric_obscure_query(self, db, results):
        """Obscure numeric question — should return a number, not 'Could not'."""
        results.start_test(
            "research: numeric/obscure query",
            SECTION_3,
            'query="Population of Liechtenstein?"',
        )
        try:
            from tools.builtin.web import _research_web_core

            steps = await _collect_steps(
                _research_web_core(
                    "Population of Liechtenstein?",
                    3, db, TEST_USER_ID, thoroughness="exploratory",
                )
            )
            for s in steps:
                detail = s.get("detail", s.get("query", s.get("url", s.get("text", ""))))
                results.add_step(s["action"], str(detail)[:200])

            answer = next((s for s in steps if s["action"] == "answer"), None)
            answer_text = str(answer.get("text", "")) if answer else ""
            results.set_output(answer_text)

            has_search = any(s["action"] == "search" for s in steps)
            has_number = bool(re.search(r"\d{4,}", answer_text.replace(",", "")))
            not_failed = "Could not" not in answer_text

            results.set_passed(has_search and has_number and not_failed)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()


# ═══════════════════════════════════════════════════════════════════════════
# Section 4: Strategy Integration (calls web APIs)
# ═══════════════════════════════════════════════════════════════════════════


class TestStrategyIntegration:
    """Full ResearchStrategy.execute_one() with template interpolation + coercion."""

    async def test_strategy_anthropic_founded(self, test_table, results):
        """Research strategy: 'What year was {Name} founded?' for Anthropic → should contain 2021."""
        table, _ = test_table
        results.start_test(
            "strategy: Anthropic founding year",
            SECTION_4,
            'row={"Name": "Anthropic"}, question="What year was {Name} founded?"',
        )
        try:
            from tools.builtin.strategies import get_strategy

            strategy = get_strategy("research")
            assert strategy is not None, "research strategy not registered"

            row_data = {"Name": "Anthropic", "Founded": "2021", "Industry": "Tech"}
            params = {"question": "What year was {Name} founded?"}

            steps = await run_with_session(lambda s: _collect_row_steps(
                strategy.execute_one(row_data, params, table.columns, s, TEST_USER_ID)
            ))
            for s in steps:
                results.add_step(s.type, s.detail[:200] if s.detail else "", s.data)

            answer = next((s for s in steps if s.type == "answer"), None)
            answer_val = answer.data.get("value", "") if answer and answer.data else ""
            results.set_output(str(answer_val))

            has_search = any(s.type == "search" for s in steps)
            results.set_passed(has_search and "2021" in str(answer_val))
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_strategy_stripe_employees(self, test_table, results):
        """Research strategy: 'How many employees does {Name} have?' for Stripe → non-empty, has number."""
        table, _ = test_table
        results.start_test(
            "strategy: Stripe employee count",
            SECTION_4,
            'row={"Name": "Stripe"}, question="How many employees does {Name} have?"',
        )
        try:
            from tools.builtin.strategies import get_strategy
            from tools.builtin.strategies.coerce import coerce_value

            # Use research strategy (not lookup) — employee counts often need page fetching
            strategy = get_strategy("research")
            assert strategy is not None, "research strategy not registered"

            row_data = {"Name": "Stripe", "Founded": "2010", "Industry": "Finance"}
            params = {"question": "How many employees does {Name} have?"}

            steps = await run_with_session(lambda s: _collect_row_steps(
                strategy.execute_one(row_data, params, table.columns, s, TEST_USER_ID)
            ))
            for s in steps:
                results.add_step(s.type, s.detail[:200] if s.detail else "", s.data)

            answer = next((s for s in steps if s.type == "answer"), None)
            answer_val = answer.data.get("value", "") if answer and answer.data else ""
            results.set_output(str(answer_val))

            # Coerce to number to verify it's numeric
            coerced, conf = coerce_value(str(answer_val), "number")
            results.add_step("coercion", f"value={coerced!r}, confidence={conf}")

            non_empty = bool(answer_val) and "Could not" not in str(answer_val)
            has_number = bool(re.search(r"\d+", coerced))

            results.set_passed(non_empty and has_number)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_strategy_moderna_industry(self, test_table, results):
        """Lookup strategy: 'Is {Name} a tech, finance, or healthcare company?' for Moderna with select column → Healthcare."""
        table, _ = test_table
        results.start_test(
            "strategy: Moderna industry (select coercion)",
            SECTION_4,
            'row={"Name": "Moderna"}, question="Is {Name} a tech, finance, or healthcare company?", select=["Tech","Finance","Healthcare"]',
        )
        try:
            from tools.builtin.strategies import get_strategy
            from tools.builtin.strategies.coerce import coerce_value

            strategy = get_strategy("lookup")
            assert strategy is not None, "lookup strategy not registered"

            row_data = {"Name": "Moderna", "Founded": "2010", "Industry": "Healthcare"}
            params = {"question": "Is {Name} a tech, finance, or healthcare company?"}

            steps = await run_with_session(lambda s: _collect_row_steps(
                strategy.execute_one(row_data, params, table.columns, s, TEST_USER_ID)
            ))
            for s in steps:
                results.add_step(s.type, s.detail[:200] if s.detail else "", s.data)

            answer = next((s for s in steps if s.type == "answer"), None)
            answer_val = answer.data.get("value", "") if answer and answer.data else ""
            results.set_output(f"raw={answer_val!r}")

            # Coerce with select options
            coerced, conf = coerce_value(
                str(answer_val), "select", ["Tech", "Finance", "Healthcare"]
            )
            results.add_step("coercion", f"value={coerced!r}, confidence={conf}")
            results.set_output(f"raw={answer_val!r}, coerced={coerced!r}, conf={conf}")

            results.set_passed(coerced == "Healthcare")
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()
