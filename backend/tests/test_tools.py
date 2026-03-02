"""
Tool Test Harness

Calls tool executors and core generators against the live DB,
writing every result to a browsable markdown file.

Run:
    cd backend
    python -m pytest tests/test_tools.py -v -s

Then browse: tests/results/tool_test_results.md
"""

import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest

from database import AsyncSessionLocal
from schemas.table import ColumnDefinition, RowCreate, TableCreate
from services.row_service import RowService
from services.table_service import TableService
from tests.helpers import ResultsWriter, ResultRecord, StepRecord

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────
TEST_USER_ID = 1  # cliff.rosen@gmail.com


# ═══════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════


@pytest.fixture(scope="module")
def results(request):
    """Module-scoped results writer — writes markdown on teardown, cleans up test table."""
    writer = ResultsWriter()
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


async def _create_test_table():
    """Create a temp table + seed rows. Returns (table, row_ids)."""
    async with fresh_session() as session:
        table_service = TableService(session)
        row_service = RowService(session)

        table = await table_service.create(
            user_id=TEST_USER_ID,
            data=TableCreate(
                name="__test_tools__",
                description="Temp table for tool tests",
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


# Module-level cache for the shared test table
_shared_table = None


@pytest.fixture
async def test_table():
    """
    Lazily create a shared test table on first use, reuse for all tests.
    Teardown happens via the module-scoped results fixture.
    """
    global _shared_table
    if _shared_table is None:
        _shared_table = await _create_test_table()
    return _shared_table


# ═══════════════════════════════════════════════════════════════════════════
# Phase 1: Standalone Tools
# ═══════════════════════════════════════════════════════════════════════════

SECTION_1 = "1. Standalone Tools"


class TestStandaloneTools:
    """Standalone tool executors (global, no table context)."""

    # ── compute_value ─────────────────────────────────────────────────────

    async def test_compute_simple_math(self, db, results):
        results.start_test("compute_value: simple math", SECTION_1, 'formula="15 * 23"')
        try:
            from tools.builtin.compute import execute_compute_value

            out = await execute_compute_value(
                {"formula": "15 * 23"}, db, TEST_USER_ID, {}
            )
            results.set_output(out)
            results.set_passed("345" in out)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_compute_with_data(self, db, results):
        results.start_test(
            "compute_value: placeholders",
            SECTION_1,
            'formula="{Price} * {Qty}", data={"Price": 10, "Qty": 5}',
        )
        try:
            from tools.builtin.compute import execute_compute_value

            out = await execute_compute_value(
                {"formula": "{Price} * {Qty}", "data": {"Price": 10, "Qty": 5}},
                db, TEST_USER_ID, {},
            )
            results.set_output(out)
            results.set_passed("50" in out)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_compute_complex(self, db, results):
        results.start_test(
            "compute_value: Haiku fallback",
            SECTION_1,
            'formula="the average of 10, 20, and 30"',
        )
        try:
            from tools.builtin.compute import execute_compute_value

            out = await execute_compute_value(
                {"formula": "the average of 10, 20, and 30"}, db, TEST_USER_ID, {}
            )
            results.set_output(out)
            # Should return something numeric — Haiku fallback
            results.set_passed("20" in out and "Error" not in out)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_compute_empty(self, db, results):
        results.start_test("compute_value: empty formula", SECTION_1, 'formula=""')
        try:
            from tools.builtin.compute import execute_compute_value

            out = await execute_compute_value({"formula": ""}, db, TEST_USER_ID, {})
            results.set_output(out)
            results.set_passed("Error" in out or "error" in out.lower())
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    # ── lookup_web ────────────────────────────────────────────────────────

    async def test_lookup_fact(self, db, results):
        results.start_test(
            "lookup_web: simple fact",
            SECTION_1,
            'question="What year was Google founded?"',
        )
        try:
            from tools.builtin.web import execute_lookup_web

            out = await execute_lookup_web(
                {"question": "What year was Google founded?"}, db, TEST_USER_ID, {}
            )
            results.set_output(out)
            results.set_passed("1998" in out)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_lookup_person(self, db, results):
        results.start_test(
            "lookup_web: person",
            SECTION_1,
            'question="Who is the CEO of Anthropic?"',
        )
        try:
            from tools.builtin.web import execute_lookup_web

            out = await execute_lookup_web(
                {"question": "Who is the CEO of Anthropic?"}, db, TEST_USER_ID, {}
            )
            results.set_output(out)
            results.set_passed(
                len(out) > 3 and "Could not" not in out and "Error" not in out
            )
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_lookup_empty(self, db, results):
        results.start_test("lookup_web: empty question", SECTION_1, 'question=""')
        try:
            from tools.builtin.web import execute_lookup_web

            out = await execute_lookup_web({"question": ""}, db, TEST_USER_ID, {})
            results.set_output(out)
            results.set_passed("Error" in out or "error" in out.lower())
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    # ── research_web ──────────────────────────────────────────────────────

    async def test_research_exploratory(self, db, results):
        results.start_test(
            "research_web: exploratory",
            SECTION_1,
            'query="What does Anthropic make?", thoroughness="exploratory"',
        )
        try:
            from tools.builtin.web import execute_research_web

            out = await execute_research_web(
                {"query": "What does Anthropic make?", "thoroughness": "exploratory"},
                db, TEST_USER_ID, {},
            )
            results.set_output(out)
            results.set_passed(
                len(out) > 10 and "Could not" not in out and "Error" not in out
            )
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_research_comprehensive(self, db, results):
        results.start_test(
            "research_web: comprehensive",
            SECTION_1,
            'query="What are all Claude model families?", thoroughness="comprehensive"',
        )
        try:
            from tools.builtin.web import execute_research_web

            out = await execute_research_web(
                {
                    "query": "What are all Claude model families?",
                    "thoroughness": "comprehensive",
                },
                db, TEST_USER_ID, {},
            )
            results.set_output(out)
            results.set_passed(
                len(out) > 20 and "Could not" not in out and "Error" not in out
            )
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_research_empty(self, db, results):
        results.start_test("research_web: empty query", SECTION_1, 'query=""')
        try:
            from tools.builtin.web import execute_research_web

            out = await execute_research_web({"query": ""}, db, TEST_USER_ID, {})
            results.set_output(out)
            results.set_passed("Error" in out or "error" in out.lower())
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    # ── search_web ────────────────────────────────────────────────────────

    async def test_search_web(self, db, results):
        results.start_test(
            "search_web: basic search", SECTION_1, 'query="Anthropic AI"'
        )
        try:
            from tools.builtin.web import execute_search_web

            out = await execute_search_web(
                {"query": "Anthropic AI"}, db, TEST_USER_ID, {}
            )
            results.set_output(out)
            results.set_passed(
                "Anthropic" in out and "Error" not in out and len(out) > 50
            )
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    # ── fetch_webpage ─────────────────────────────────────────────────────

    async def test_fetch_webpage(self, db, results):
        results.start_test(
            "fetch_webpage: example.com", SECTION_1, 'url="http://example.com"'
        )
        try:
            from tools.builtin.web import execute_fetch_webpage

            # Use http:// to avoid SSL cert issues in some Python builds
            out = await execute_fetch_webpage(
                {"url": "http://example.com"}, db, TEST_USER_ID, {}
            )
            results.set_output(out)
            results.set_passed("Example Domain" in out and "Error" not in out)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_fetch_webpage_zillow(self, db, results):
        results.start_test(
            "fetch_webpage: Zillow (CloudFront)",
            SECTION_1,
            'url="https://www.zillow.com/homedetails/123-Main-St/"',
        )
        try:
            from tools.builtin.web import execute_fetch_webpage

            out = await execute_fetch_webpage(
                {"url": "https://www.zillow.com"}, db, TEST_USER_ID, {}
            )
            results.set_output(out[:500] if len(out) > 500 else out)
            # Should get 200 with real content (not a 403)
            results.set_passed("Error:" not in out and len(out) > 200)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_fetch_webpage_streeteasy(self, db, results):
        results.start_test(
            "fetch_webpage: StreetEasy (CloudFront)",
            SECTION_1,
            'url="https://streeteasy.com"',
        )
        try:
            from tools.builtin.web import execute_fetch_webpage

            out = await execute_fetch_webpage(
                {"url": "https://streeteasy.com"}, db, TEST_USER_ID, {}
            )
            results.set_output(out[:500] if len(out) > 500 else out)
            # Should get 200 with real content (not a 403)
            results.set_passed("Error:" not in out and len(out) > 200)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_fetch_webpage_blocked_graceful(self, db, results):
        results.start_test(
            "fetch_webpage: apartments.com (Akamai, expect graceful error)",
            SECTION_1,
            'url="https://www.apartments.com"',
        )
        try:
            from tools.builtin.web import execute_fetch_webpage

            out = await execute_fetch_webpage(
                {"url": "https://www.apartments.com"}, db, TEST_USER_ID, {}
            )
            results.set_output(out[:500] if len(out) > 500 else out)
            # Akamai will likely 403 — we want a clean Error: string, not a crash
            # Pass if we got content (unlikely) OR a clean error with 403
            if "Error:" in out:
                results.set_passed("403" in out)
            else:
                # Got through — also fine
                results.set_passed(len(out) > 100)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()


# ═══════════════════════════════════════════════════════════════════════════
# Phase 2: Core Generators (step dict traces)
# ═══════════════════════════════════════════════════════════════════════════

SECTION_2 = "2. Core Generators"


async def _collect_steps(async_gen) -> List[Dict[str, Any]]:
    """Consume an async generator, collecting all yielded dicts."""
    steps = []
    async for step in async_gen:
        steps.append(step)
    return steps


class TestCoreGenerators:
    """Call core generator functions directly and trace all steps."""

    async def test_compute_core_safe_eval(self, results):
        results.start_test(
            "_compute_core: safe eval",
            SECTION_2,
            'formula="2 + 2", row_data={}',
        )
        try:
            from tools.builtin.compute import _compute_core

            steps = await _collect_steps(_compute_core("2 + 2", {}))
            for s in steps:
                results.add_step(s["action"], str(s.get("detail", s.get("text", ""))))
            answer = next((s for s in steps if s["action"] == "answer"), None)
            answer_text = answer.get("text", "") if answer else ""
            results.set_output(answer_text)
            results.set_passed(answer_text == "4")
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_compute_core_placeholders(self, results):
        results.start_test(
            "_compute_core: placeholders",
            SECTION_2,
            'formula="{x} * {y}", row_data={"x": 3, "y": 7}',
        )
        try:
            from tools.builtin.compute import _compute_core

            steps = await _collect_steps(_compute_core("{x} * {y}", {"x": 3, "y": 7}))
            for s in steps:
                results.add_step(s["action"], str(s.get("detail", s.get("text", ""))))
            answer = next((s for s in steps if s["action"] == "answer"), None)
            answer_text = answer.get("text", "") if answer else ""
            results.set_output(answer_text)
            results.set_passed("21" in answer_text)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_lookup_core_steps(self, db, results):
        results.start_test(
            "_lookup_web_core: step trace",
            SECTION_2,
            'question="What year was Python created?"',
        )
        try:
            from tools.builtin.web import _lookup_web_core

            steps = await _collect_steps(
                _lookup_web_core("What year was Python created?", 2, db, TEST_USER_ID)
            )
            for s in steps:
                detail = s.get("detail", s.get("query", s.get("text", "")))
                results.add_step(s["action"], str(detail))
            answer = next((s for s in steps if s["action"] == "answer"), None)
            answer_text = answer.get("text", "") if answer else ""
            results.set_output(answer_text)
            has_search = any(s["action"] == "search" for s in steps)
            results.set_passed(has_search and "1991" in answer_text)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_research_core_steps(self, db, results):
        results.start_test(
            "_research_web_core: step trace",
            SECTION_2,
            'query="Describe Claude AI", max_steps=3',
        )
        try:
            from tools.builtin.web import _research_web_core

            steps = await _collect_steps(
                _research_web_core("Describe Claude AI", 3, db, TEST_USER_ID)
            )
            for s in steps:
                detail = s.get("detail", s.get("query", s.get("url", s.get("text", ""))))
                results.add_step(s["action"], str(detail))
            answer = next((s for s in steps if s["action"] == "answer"), None)
            answer_text = answer.get("text", "") if answer else ""
            results.set_output(answer_text)
            has_search = any(s["action"] == "search" for s in steps)
            results.set_passed(
                has_search and len(answer_text) > 10 and "Could not" not in answer_text
            )
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()


# ═══════════════════════════════════════════════════════════════════════════
# Phase 3: Table Tools (service layer wiring)
# ═══════════════════════════════════════════════════════════════════════════

SECTION_3 = "3. Table Tools"


from contextlib import asynccontextmanager


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
                    continue  # Retry with fresh session
                raise
            except Exception as e:
                if "Event loop is closed" in str(e) and attempt == 0:
                    continue
                raise
    return None


class TestTableTools:
    """Table tool executors using a temp table + service layer.
    Each test gets its own fresh DB session to avoid commit conflicts.
    """

    async def test_create_row(self, test_table, results):
        table, _ = test_table
        results.start_test(
            "create_row",
            SECTION_3,
            'values={"Name": "TestCo", "Founded": "2020", "Industry": "Tech"}',
        )
        try:
            from tools.builtin.table_data import execute_create_row

            out = await run_with_session(lambda s: execute_create_row(
                {"values": {"Name": "TestCo", "Founded": "2020", "Industry": "Tech"}},
                s, TEST_USER_ID, {"table_id": table.id},
            ))
            results.set_output(out)
            results.set_passed("Created row" in out and "Error" not in out)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_get_rows(self, test_table, results):
        table, _ = test_table
        results.start_test("get_rows", SECTION_3, "offset=0, limit=10")
        try:
            from tools.builtin.table_data import execute_get_rows

            out = await run_with_session(lambda s: execute_get_rows(
                {"offset": 0, "limit": 10}, s, TEST_USER_ID, {"table_id": table.id},
            ))
            results.set_output(out)
            results.set_passed("Row #" in out and "Anthropic" in out)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_search_rows(self, test_table, results):
        table, _ = test_table
        results.start_test("search_rows", SECTION_3, 'query="Anthropic"')
        try:
            from tools.builtin.table_data import execute_search_rows

            out = await run_with_session(lambda s: execute_search_rows(
                {"query": "Anthropic"}, s, TEST_USER_ID, {"table_id": table.id},
            ))
            results.set_output(out)
            results.set_passed("Anthropic" in out and "Error" not in out)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_describe_table(self, test_table, results):
        table, _ = test_table
        results.start_test("describe_table", SECTION_3, "(no params)")
        try:
            from tools.builtin.table_data import execute_describe_table

            out = await run_with_session(lambda s: execute_describe_table(
                {}, s, TEST_USER_ID, {"table_id": table.id},
            ))
            results.set_output(out)
            results.set_passed(
                "__test_tools__" in out and "Name" in out and "Columns" in out
            )
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_update_row(self, test_table, results):
        table, row_ids = test_table
        target_id = row_ids[0]
        results.start_test(
            "update_row",
            SECTION_3,
            f'row_id={target_id}, values={{"Founded": "2022"}}',
        )
        try:
            from tools.builtin.table_data import execute_update_row

            out = await run_with_session(lambda s: execute_update_row(
                {"row_id": target_id, "values": {"Founded": "2022"}},
                s, TEST_USER_ID, {"table_id": table.id},
            ))
            results.set_output(out)
            results.set_passed("Updated" in out and "Error" not in out)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_delete_row(self, test_table, results):
        table, _ = test_table
        results.start_test("delete_row (extra row)", SECTION_3, "create then delete")
        try:
            from tools.builtin.table_data import execute_create_row, execute_delete_row

            async def _create_and_delete(session):
                ctx = {"table_id": table.id}
                create_out = await execute_create_row(
                    {"values": {"Name": "ToDelete"}}, session, TEST_USER_ID, ctx
                )
                m = re.search(r"#(\d+)", create_out)
                if not m:
                    return f"Error: Could not parse row id from: {create_out}"
                new_id = int(m.group(1))
                return await execute_delete_row(
                    {"row_id": new_id}, session, TEST_USER_ID, ctx
                )

            out = await run_with_session(_create_and_delete)
            results.set_output(out)
            results.set_passed("Deleted" in out and "Error" not in out)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()


# ═══════════════════════════════════════════════════════════════════════════
# Phase 4: Strategies (thin wrappers → RowSteps)
# ═══════════════════════════════════════════════════════════════════════════

SECTION_4 = "4. Strategies"


async def _collect_row_steps(async_gen):
    """Consume a strategy's execute_one, collecting RowStep objects."""
    from tools.builtin.strategies.base import RowStep

    steps = []
    async for step in async_gen:
        steps.append(step)
    return steps


class TestStrategies:
    """Strategy execute_one() directly, collecting RowStep objects.
    Each test gets its own fresh DB session.
    """

    async def test_lookup_strategy(self, test_table, results):
        table, _ = test_table
        results.start_test(
            "lookup strategy",
            SECTION_4,
            'row={"Name": "Anthropic"}, question="What year was {Name} founded?"',
        )
        try:
            from tools.builtin.strategies import get_strategy

            strategy = get_strategy("lookup")
            assert strategy is not None, "lookup strategy not registered"

            row_data = {"Name": "Anthropic", "Founded": "2021", "Industry": "Tech"}
            params = {"question": "What year was {Name} founded?"}

            steps = await run_with_session(lambda s: _collect_row_steps(
                strategy.execute_one(row_data, params, table.columns, s, TEST_USER_ID)
            ))
            for s in steps:
                results.add_step(s.type, s.detail, s.data)

            answer = next((s for s in steps if s.type == "answer"), None)
            answer_val = answer.data.get("value", "") if answer and answer.data else ""
            results.set_output(str(answer_val))

            has_search = any(s.type == "search" for s in steps)
            results.set_passed(has_search and answer_val and "Could not" not in answer_val)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_computation_strategy(self, test_table, results):
        table, _ = test_table
        results.start_test(
            "computation strategy",
            SECTION_4,
            'row={"Name": "Anthropic", "Founded": "2021"}, formula="2026 - {Founded}"',
        )
        try:
            from tools.builtin.strategies import get_strategy

            strategy = get_strategy("computation")
            assert strategy is not None, "computation strategy not registered"

            row_data = {"Name": "Anthropic", "Founded": "2021", "Industry": "Tech"}
            params = {"formula": "2026 - {Founded}"}

            steps = await run_with_session(lambda s: _collect_row_steps(
                strategy.execute_one(row_data, params, table.columns, s, TEST_USER_ID)
            ))
            for s in steps:
                results.add_step(s.type, s.detail, s.data)

            answer = next((s for s in steps if s.type == "answer"), None)
            answer_val = answer.data.get("value", "") if answer and answer.data else ""
            results.set_output(str(answer_val))

            has_compute = any(s.type == "compute" for s in steps)
            results.set_passed(has_compute and "5" in str(answer_val))
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    async def test_research_strategy(self, test_table, results):
        table, _ = test_table
        results.start_test(
            "research strategy",
            SECTION_4,
            'row={"Name": "Anthropic"}, question="What products does {Name} make?"',
        )
        try:
            from tools.builtin.strategies import get_strategy

            strategy = get_strategy("research")
            assert strategy is not None, "research strategy not registered"

            row_data = {"Name": "Anthropic", "Founded": "2021", "Industry": "Tech"}
            params = {"question": "What products does {Name} make?"}

            steps = await run_with_session(lambda s: _collect_row_steps(
                strategy.execute_one(row_data, params, table.columns, s, TEST_USER_ID)
            ))
            for s in steps:
                results.add_step(s.type, s.detail, s.data)

            answer = next((s for s in steps if s.type == "answer"), None)
            answer_val = answer.data.get("value", "") if answer and answer.data else ""
            results.set_output(str(answer_val))

            has_search = any(s.type == "search" for s in steps)
            results.set_passed(
                has_search and len(str(answer_val)) > 10 and "Could not" not in str(answer_val)
            )
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()
