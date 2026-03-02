"""
Core Flow API Tests — validates core-flow.md

Tests the full lifecycle: create table → populate → add column → update rows.
Writes results to: tests/results/core_flow_results.md

Run:
    cd backend
    python -m pytest tests/test_core_flow.py -v -s
"""

import time
import uuid
from pathlib import Path

import pytest

from tests.conftest import APIClient, TEST_BASE_URL
from tests.helpers import FlowResultsWriter

RESULTS_FILE = Path(__file__).parent / "results" / "core_flow_results.md"

SECTION_CREATE = "1. Create Table (CF Step 1)"
SECTION_POPULATE = "2. Populate Data (CF Step 2)"
SECTION_SCHEMA = "3. Add Column (CF Step 3)"
SECTION_UPDATE = "4. Update Rows (CF Step 4)"
SECTION_LIFECYCLE = "5. Full Lifecycle"
SECTION_CROSS = "6. Cross-Cutting"


# ═══════════════════════════════════════════════════════════════════════════
# Module fixtures
# ═══════════════════════════════════════════════════════════════════════════


@pytest.fixture(scope="module")
def results():
    writer = FlowResultsWriter(RESULTS_FILE, title="Core Flow Results")
    writer.set_sections([
        SECTION_CREATE, SECTION_POPULATE, SECTION_SCHEMA,
        SECTION_UPDATE, SECTION_LIFECYCLE, SECTION_CROSS,
    ])
    yield writer
    writer.write()


@pytest.fixture(scope="module")
def client():
    """Authenticated client for the module — registers a fresh user."""
    c = APIClient(TEST_BASE_URL)
    ts = int(time.time())
    short_id = uuid.uuid4().hex[:6]
    email = f"coretest_{ts}_{short_id}@test.example.com"
    resp = c.register(email, "TestPass123!")
    assert resp.status_code == 200, f"Registration failed: {resp.text}"
    return c


# Standard test columns
BASIC_COLUMNS = [
    {"id": "col_name", "name": "Name", "type": "text", "required": True},
    {"id": "col_age", "name": "Age", "type": "number"},
    {"id": "col_active", "name": "Active", "type": "boolean"},
]


def _cleanup_table(client: APIClient, table_id: int):
    """Best-effort table deletion."""
    try:
        client.delete(f"/api/tables/{table_id}")
    except Exception:
        pass


# ═══════════════════════════════════════════════════════════════════════════
# Step 1: Create Table
# ═══════════════════════════════════════════════════════════════════════════


class TestCreateTable:

    def test_create_table(self, client, results):
        """CF Step 1: POST /tables with columns returns 201 with schema."""
        results.start_test("create_table", SECTION_CREATE, "POST /api/tables with 3 columns")
        tid = None
        try:
            resp = client.post("/api/tables", json={
                "name": "Test Table Basic",
                "description": "Created by test_core_flow",
                "columns": BASIC_COLUMNS,
            })
            data = resp.json()
            results.add_step("POST", f"/api/tables → {resp.status_code}")
            results.set_output(f"id={data.get('id')}, cols={len(data.get('columns', []))}")
            tid = data.get("id")
            ok = (
                resp.status_code == 201
                and len(data.get("columns", [])) == 3
                and data["columns"][0]["name"] == "Name"
                and data["name"] == "Test Table Basic"
            )
            results.set_passed(ok)
        except Exception as e:
            results.set_error(str(e))
        finally:
            if tid:
                _cleanup_table(client, tid)
        results.finish_test()

    def test_create_table_all_types(self, client, results):
        """CF Step 1: text, number, date, boolean, select all accepted."""
        results.start_test("create_table_all_types", SECTION_CREATE, "All 5 column types")
        tid = None
        try:
            columns = [
                {"id": "col_t", "name": "Text Col", "type": "text"},
                {"id": "col_n", "name": "Number Col", "type": "number"},
                {"id": "col_d", "name": "Date Col", "type": "date"},
                {"id": "col_b", "name": "Bool Col", "type": "boolean"},
                {"id": "col_s", "name": "Select Col", "type": "select", "options": ["A", "B"]},
            ]
            resp = client.post("/api/tables", json={
                "name": "All Types Table",
                "columns": columns,
            })
            data = resp.json()
            results.add_step("POST", f"/api/tables → {resp.status_code}")
            tid = data.get("id")
            types = [c["type"] for c in data.get("columns", [])]
            results.set_output(f"types={types}")
            ok = (
                resp.status_code == 201
                and set(types) == {"text", "number", "date", "boolean", "select"}
            )
            results.set_passed(ok)
        except Exception as e:
            results.set_error(str(e))
        finally:
            if tid:
                _cleanup_table(client, tid)
        results.finish_test()

    def test_create_table_select_options(self, client, results):
        """CF Step 1: Select column options stored correctly."""
        results.start_test("create_table_select_options", SECTION_CREATE, "Select with options=[High, Medium, Low]")
        tid = None
        try:
            columns = [
                {"id": "col_pri", "name": "Priority", "type": "select", "options": ["High", "Medium", "Low"]},
            ]
            resp = client.post("/api/tables", json={
                "name": "Select Options Table",
                "columns": columns,
            })
            data = resp.json()
            results.add_step("POST", f"/api/tables → {resp.status_code}")
            tid = data.get("id")
            opts = data["columns"][0].get("options", [])
            results.set_output(f"options={opts}")
            results.set_passed(
                resp.status_code == 201
                and opts == ["High", "Medium", "Low"]
            )
        except Exception as e:
            results.set_error(str(e))
        finally:
            if tid:
                _cleanup_table(client, tid)
        results.finish_test()

    def test_get_table(self, client, results):
        """CF Step 1: GET /tables/{id} returns full schema."""
        results.start_test("get_table", SECTION_CREATE, "GET /api/tables/{id}")
        tid = None
        try:
            # Create
            resp = client.post("/api/tables", json={
                "name": "Get Test Table",
                "description": "For GET test",
                "columns": BASIC_COLUMNS,
            })
            tid = resp.json()["id"]
            results.add_step("POST", f"Created table {tid}")

            # Get
            resp2 = client.get(f"/api/tables/{tid}")
            data = resp2.json()
            results.add_step("GET", f"/api/tables/{tid} → {resp2.status_code}")
            results.set_output(f"name={data.get('name')}, cols={len(data.get('columns', []))}")
            ok = (
                resp2.status_code == 200
                and data["name"] == "Get Test Table"
                and data["description"] == "For GET test"
                and len(data["columns"]) == 3
            )
            results.set_passed(ok)
        except Exception as e:
            results.set_error(str(e))
        finally:
            if tid:
                _cleanup_table(client, tid)
        results.finish_test()


# ═══════════════════════════════════════════════════════════════════════════
# Step 2: Populate Data
# ═══════════════════════════════════════════════════════════════════════════


class TestPopulateData:

    def test_create_row(self, client, results):
        """CF Step 2: POST /tables/{id}/rows creates a row."""
        results.start_test("create_row", SECTION_POPULATE, "POST row with Name, Age, Active")
        tid = None
        try:
            resp = client.post("/api/tables", json={
                "name": "Row Test Table",
                "columns": BASIC_COLUMNS,
            })
            tid = resp.json()["id"]
            col_ids = {c["name"]: c["id"] for c in resp.json()["columns"]}

            row_resp = client.post(f"/api/tables/{tid}/rows", json={
                "data": {
                    col_ids["Name"]: "Alice",
                    col_ids["Age"]: 30,
                    col_ids["Active"]: True,
                }
            })
            row_data = row_resp.json()
            results.add_step("POST", f"/api/tables/{tid}/rows → {row_resp.status_code}")
            results.set_output(f"row_id={row_data.get('id')}, data={row_data.get('data')}")
            ok = (
                row_resp.status_code == 201
                and row_data.get("id") is not None
                and row_data["data"][col_ids["Name"]] == "Alice"
            )
            results.set_passed(ok)
        except Exception as e:
            results.set_error(str(e))
        finally:
            if tid:
                _cleanup_table(client, tid)
        results.finish_test()

    def test_create_multiple_rows(self, client, results):
        """CF Step 2: Sequential row creation, GET returns all."""
        results.start_test("create_multiple_rows", SECTION_POPULATE, "Create 3 rows then GET all")
        tid = None
        try:
            resp = client.post("/api/tables", json={
                "name": "Multi Row Table",
                "columns": BASIC_COLUMNS,
            })
            tid = resp.json()["id"]
            col_ids = {c["name"]: c["id"] for c in resp.json()["columns"]}

            names = ["Alice", "Bob", "Charlie"]
            for name in names:
                client.post(f"/api/tables/{tid}/rows", json={
                    "data": {col_ids["Name"]: name, col_ids["Age"]: 25}
                })
            results.add_step("POST", f"Created 3 rows")

            list_resp = client.get(f"/api/tables/{tid}/rows")
            data = list_resp.json()
            results.add_step("GET", f"/api/tables/{tid}/rows → {list_resp.status_code}")
            row_count = len(data.get("rows", []))
            results.set_output(f"rows returned: {row_count}")
            results.set_passed(list_resp.status_code == 200 and row_count == 3)
        except Exception as e:
            results.set_error(str(e))
        finally:
            if tid:
                _cleanup_table(client, tid)
        results.finish_test()

    def test_rows_pagination(self, client, results):
        """CF Step 2: offset/limit work correctly."""
        results.start_test("rows_pagination", SECTION_POPULATE, "Create 5 rows, fetch with offset=2&limit=2")
        tid = None
        try:
            resp = client.post("/api/tables", json={
                "name": "Pagination Table",
                "columns": [{"id": "col_name", "name": "Name", "type": "text"}],
            })
            tid = resp.json()["id"]
            col_id = resp.json()["columns"][0]["id"]

            for i in range(5):
                client.post(f"/api/tables/{tid}/rows", json={
                    "data": {col_id: f"Item {i}"}
                })
            results.add_step("POST", "Created 5 rows")

            page_resp = client.get(f"/api/tables/{tid}/rows", params={"offset": 2, "limit": 2})
            data = page_resp.json()
            results.add_step("GET", f"offset=2&limit=2 → {page_resp.status_code}")
            rows = data.get("rows", [])
            total = data.get("total", 0)
            results.set_output(f"rows={len(rows)}, total={total}")
            ok = (
                page_resp.status_code == 200
                and len(rows) == 2
                and total == 5
            )
            results.set_passed(ok)
        except Exception as e:
            results.set_error(str(e))
        finally:
            if tid:
                _cleanup_table(client, tid)
        results.finish_test()

    def test_search_rows(self, client, results):
        """CF Step 2: POST /tables/{id}/rows/search finds content."""
        results.start_test("search_rows", SECTION_POPULATE, 'Search for "Anthropic"')
        tid = None
        try:
            resp = client.post("/api/tables", json={
                "name": "Search Table",
                "columns": [{"id": "col_company", "name": "Company", "type": "text"}],
            })
            tid = resp.json()["id"]
            col_id = resp.json()["columns"][0]["id"]

            for name in ["Anthropic", "OpenAI", "Google"]:
                client.post(f"/api/tables/{tid}/rows", json={
                    "data": {col_id: name}
                })
            results.add_step("POST", "Created 3 rows")

            search_resp = client.post(f"/api/tables/{tid}/rows/search", json={
                "query": "Anthropic",
            })
            data = search_resp.json()
            results.add_step("POST", f"/rows/search → {search_resp.status_code}")
            results.set_output(f"results={len(data)}")
            ok = (
                search_resp.status_code == 200
                and isinstance(data, list)
                and len(data) >= 1
                and any("Anthropic" in str(r.get("data", {})) for r in data)
            )
            results.set_passed(ok)
        except Exception as e:
            results.set_error(str(e))
        finally:
            if tid:
                _cleanup_table(client, tid)
        results.finish_test()


# ═══════════════════════════════════════════════════════════════════════════
# Step 3: Add Column
# ═══════════════════════════════════════════════════════════════════════════


class TestAddColumn:

    def test_add_column(self, client, results):
        """CF Step 3: PUT /tables/{id} with extra column preserves existing data."""
        results.start_test("add_column", SECTION_SCHEMA, "Add 'Website' column to existing table")
        tid = None
        try:
            # Create table with 1 column
            resp = client.post("/api/tables", json={
                "name": "Add Col Table",
                "columns": [{"id": "col_name", "name": "Name", "type": "text"}],
            })
            tid = resp.json()["id"]
            col_id = resp.json()["columns"][0]["id"]

            # Add a row
            client.post(f"/api/tables/{tid}/rows", json={
                "data": {col_id: "Anthropic"}
            })
            results.add_step("POST", "Created table + 1 row")

            # Add a column via PUT
            updated_columns = [
                {"id": "col_name", "name": "Name", "type": "text"},
                {"id": "col_website", "name": "Website", "type": "text"},
            ]
            put_resp = client.put(f"/api/tables/{tid}", json={
                "columns": updated_columns,
            })
            put_data = put_resp.json()
            results.add_step("PUT", f"/api/tables/{tid} → {put_resp.status_code}")
            col_names = [c["name"] for c in put_data.get("columns", [])]
            results.set_output(f"columns={col_names}")

            # Verify row data preserved
            rows_resp = client.get(f"/api/tables/{tid}/rows")
            rows = rows_resp.json().get("rows", [])
            row_data = rows[0]["data"] if rows else {}
            results.add_step("GET", f"Row data after add column: {row_data}")

            ok = (
                put_resp.status_code == 200
                and "Website" in col_names
                and len(col_names) == 2
                and row_data.get(col_id) == "Anthropic"
            )
            results.set_passed(ok)
        except Exception as e:
            results.set_error(str(e))
        finally:
            if tid:
                _cleanup_table(client, tid)
        results.finish_test()

    def test_existing_rows_null_new_column(self, client, results):
        """CF Step 3: Old rows have null for new column."""
        results.start_test("existing_rows_null_new_column", SECTION_SCHEMA, "New column value is null in existing rows")
        tid = None
        try:
            resp = client.post("/api/tables", json={
                "name": "Null Col Table",
                "columns": [{"id": "col_name", "name": "Name", "type": "text"}],
            })
            tid = resp.json()["id"]
            col_id = resp.json()["columns"][0]["id"]

            client.post(f"/api/tables/{tid}/rows", json={
                "data": {col_id: "Test"}
            })

            client.put(f"/api/tables/{tid}", json={
                "columns": [
                    {"id": "col_name", "name": "Name", "type": "text"},
                    {"id": "col_new", "name": "NewCol", "type": "text"},
                ],
            })
            results.add_step("PUT", "Added 'NewCol' column")

            rows_resp = client.get(f"/api/tables/{tid}/rows")
            rows = rows_resp.json().get("rows", [])
            new_col_val = rows[0]["data"].get("col_new") if rows else "NO_ROWS"
            results.set_output(f"col_new value = {new_col_val}")
            results.set_passed(new_col_val is None)
        except Exception as e:
            results.set_error(str(e))
        finally:
            if tid:
                _cleanup_table(client, tid)
        results.finish_test()


# ═══════════════════════════════════════════════════════════════════════════
# Step 4: Update Rows
# ═══════════════════════════════════════════════════════════════════════════


class TestUpdateRows:

    def test_update_row(self, client, results):
        """CF Step 4: PUT /tables/{id}/rows/{row_id} changes only target column."""
        results.start_test("update_row", SECTION_UPDATE, "Update Age column only")
        tid = None
        try:
            resp = client.post("/api/tables", json={
                "name": "Update Table",
                "columns": BASIC_COLUMNS,
            })
            tid = resp.json()["id"]
            col_ids = {c["name"]: c["id"] for c in resp.json()["columns"]}

            row_resp = client.post(f"/api/tables/{tid}/rows", json={
                "data": {col_ids["Name"]: "Alice", col_ids["Age"]: 25, col_ids["Active"]: True}
            })
            row_id = row_resp.json()["id"]
            results.add_step("POST", f"Created row {row_id}")

            update_resp = client.put(f"/api/tables/{tid}/rows/{row_id}", json={
                "data": {col_ids["Age"]: 30}
            })
            updated = update_resp.json()
            results.add_step("PUT", f"/rows/{row_id} → {update_resp.status_code}")
            results.set_output(f"data={updated.get('data')}")

            ok = (
                update_resp.status_code == 200
                and updated["data"][col_ids["Age"]] == 30
                and updated["data"][col_ids["Name"]] == "Alice"
                and updated["data"][col_ids["Active"]] is True
            )
            results.set_passed(ok)
        except Exception as e:
            results.set_error(str(e))
        finally:
            if tid:
                _cleanup_table(client, tid)
        results.finish_test()

    def test_update_multiple_rows(self, client, results):
        """CF Step 4: Sequential updates (enrichment simulation)."""
        results.start_test("update_multiple_rows", SECTION_UPDATE, "Update 3 rows sequentially")
        tid = None
        try:
            resp = client.post("/api/tables", json={
                "name": "Multi Update Table",
                "columns": [
                    {"id": "col_name", "name": "Name", "type": "text"},
                    {"id": "col_website", "name": "Website", "type": "text"},
                ],
            })
            tid = resp.json()["id"]

            companies = ["Anthropic", "OpenAI", "Google"]
            row_ids = []
            for name in companies:
                r = client.post(f"/api/tables/{tid}/rows", json={
                    "data": {"col_name": name}
                })
                row_ids.append(r.json()["id"])
            results.add_step("POST", f"Created {len(row_ids)} rows")

            websites = ["anthropic.com", "openai.com", "google.com"]
            for rid, website in zip(row_ids, websites):
                client.put(f"/api/tables/{tid}/rows/{rid}", json={
                    "data": {"col_website": website}
                })
            results.add_step("PUT", "Updated all 3 with websites")

            rows_resp = client.get(f"/api/tables/{tid}/rows")
            rows = rows_resp.json().get("rows", [])
            all_have_website = all(
                r["data"].get("col_website") is not None for r in rows
            )
            results.set_output(f"rows={len(rows)}, all_have_website={all_have_website}")
            results.set_passed(len(rows) == 3 and all_have_website)
        except Exception as e:
            results.set_error(str(e))
        finally:
            if tid:
                _cleanup_table(client, tid)
        results.finish_test()


# ═══════════════════════════════════════════════════════════════════════════
# Full Lifecycle
# ═══════════════════════════════════════════════════════════════════════════


class TestFullLifecycle:

    def test_full_lifecycle(self, client, results):
        """All 4 steps: create → populate → add column → update → verify → cleanup."""
        results.start_test("full_lifecycle", SECTION_LIFECYCLE, "End-to-end core flow")
        tid = None
        try:
            # Step 1: Create table
            resp = client.post("/api/tables", json={
                "name": "Lifecycle Table",
                "description": "Full lifecycle test",
                "columns": [
                    {"id": "col_company", "name": "Company", "type": "text", "required": True},
                    {"id": "col_founded", "name": "Founded", "type": "number"},
                ],
            })
            assert resp.status_code == 201
            tid = resp.json()["id"]
            results.add_step("create", f"Table {tid} created with 2 columns")

            # Step 2: Populate
            companies = [
                {"col_company": "Anthropic", "col_founded": 2021},
                {"col_company": "OpenAI", "col_founded": 2015},
                {"col_company": "Google DeepMind", "col_founded": 2010},
            ]
            row_ids = []
            for data in companies:
                r = client.post(f"/api/tables/{tid}/rows", json={"data": data})
                assert r.status_code == 201
                row_ids.append(r.json()["id"])
            results.add_step("populate", f"Added {len(row_ids)} rows")

            # Step 3: Add column
            put_resp = client.put(f"/api/tables/{tid}", json={
                "columns": [
                    {"id": "col_company", "name": "Company", "type": "text", "required": True},
                    {"id": "col_founded", "name": "Founded", "type": "number"},
                    {"id": "col_website", "name": "Website", "type": "text"},
                ],
            })
            assert put_resp.status_code == 200
            results.add_step("add_column", "Added 'Website' column")

            # Step 4: Update (simulate enrichment)
            websites = ["anthropic.com", "openai.com", "deepmind.google"]
            for rid, website in zip(row_ids, websites):
                u = client.put(f"/api/tables/{tid}/rows/{rid}", json={
                    "data": {"col_website": website}
                })
                assert u.status_code == 200
            results.add_step("update", "Enriched all 3 rows with websites")

            # Verify final state
            final_table = client.get(f"/api/tables/{tid}").json()
            final_rows = client.get(f"/api/tables/{tid}/rows").json()
            col_count = len(final_table["columns"])
            row_count = len(final_rows["rows"])
            all_enriched = all(
                r["data"].get("col_website") is not None
                for r in final_rows["rows"]
            )
            results.add_step("verify", f"cols={col_count}, rows={row_count}, all_enriched={all_enriched}")
            results.set_output(f"Final: {col_count} columns, {row_count} rows, all enriched: {all_enriched}")

            ok = col_count == 3 and row_count == 3 and all_enriched
            results.set_passed(ok)
        except Exception as e:
            results.set_error(str(e))
        finally:
            if tid:
                _cleanup_table(client, tid)
        results.finish_test()


# ═══════════════════════════════════════════════════════════════════════════
# Cross-Cutting
# ═══════════════════════════════════════════════════════════════════════════


class TestCrossCutting:

    def test_delete_row(self, client, results):
        """Cross: DELETE row works."""
        results.start_test("delete_row", SECTION_CROSS, "DELETE /tables/{id}/rows/{row_id}")
        tid = None
        try:
            resp = client.post("/api/tables", json={
                "name": "Delete Row Table",
                "columns": [{"id": "col_name", "name": "Name", "type": "text"}],
            })
            tid = resp.json()["id"]

            row_resp = client.post(f"/api/tables/{tid}/rows", json={
                "data": {"col_name": "ToDelete"}
            })
            row_id = row_resp.json()["id"]
            results.add_step("POST", f"Created row {row_id}")

            del_resp = client.delete(f"/api/tables/{tid}/rows/{row_id}")
            results.add_step("DELETE", f"/rows/{row_id} → {del_resp.status_code}")

            # Verify row is gone
            rows_resp = client.get(f"/api/tables/{tid}/rows")
            row_count = len(rows_resp.json().get("rows", []))
            results.set_output(f"rows after delete: {row_count}")
            results.set_passed(del_resp.status_code == 200 and row_count == 0)
        except Exception as e:
            results.set_error(str(e))
        finally:
            if tid:
                _cleanup_table(client, tid)
        results.finish_test()

    def test_table_isolation(self, client, results):
        """Cross: User A can't access User B's table."""
        results.start_test("table_isolation", SECTION_CROSS, "User B cannot GET User A's table")
        tid = None
        try:
            # Create table as current user (User A)
            resp = client.post("/api/tables", json={
                "name": "Isolation Table",
                "columns": [{"id": "col_x", "name": "X", "type": "text"}],
            })
            tid = resp.json()["id"]
            results.add_step("POST", f"User A created table {tid}")

            # Register User B
            ts = int(time.time())
            short_id = uuid.uuid4().hex[:6]
            user_b = APIClient(TEST_BASE_URL)
            user_b.register(f"userb_{ts}_{short_id}@test.example.com", "TestPass123!")
            results.add_step("register", "User B registered")

            # User B tries to access User A's table
            b_resp = user_b.get(f"/api/tables/{tid}")
            results.add_step("GET", f"User B → /api/tables/{tid} → {b_resp.status_code}")
            results.set_output(f"status={b_resp.status_code}")
            # Should be 404 (table not found for this user) or 403
            results.set_passed(b_resp.status_code in (403, 404))
        except Exception as e:
            results.set_error(str(e))
        finally:
            if tid:
                _cleanup_table(client, tid)
        results.finish_test()
