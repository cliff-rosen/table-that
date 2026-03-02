"""
Auth Flow API Tests — validates new-user-flow.md

Tests registration, login, profile access, and auth guards.
Writes results to: tests/results/auth_flow_results.md

Run:
    cd backend
    python -m pytest tests/test_auth_flow.py -v -s
"""

import time
import uuid
from pathlib import Path

import pytest

from tests.conftest import APIClient, TEST_BASE_URL
from tests.helpers import FlowResultsWriter

RESULTS_FILE = Path(__file__).parent / "results" / "auth_flow_results.md"

SECTION_REG = "1. Registration"
SECTION_LOGIN = "2. Login"
SECTION_CROSS = "3. Cross-Cutting"


# ═══════════════════════════════════════════════════════════════════════════
# Module fixtures
# ═══════════════════════════════════════════════════════════════════════════


@pytest.fixture(scope="module")
def results():
    writer = FlowResultsWriter(RESULTS_FILE, title="Auth Flow Results")
    writer.set_sections([SECTION_REG, SECTION_LOGIN, SECTION_CROSS])
    yield writer
    writer.write()


@pytest.fixture(scope="module")
def fresh_email():
    ts = int(time.time())
    short_id = uuid.uuid4().hex[:6]
    return f"authtest_{ts}_{short_id}@test.example.com"


@pytest.fixture(scope="module")
def fresh_password():
    return "TestPass123!"


# ═══════════════════════════════════════════════════════════════════════════
# Registration tests (NUF Step 1)
# ═══════════════════════════════════════════════════════════════════════════


class TestRegistration:

    def test_register_new_user(self, fresh_email, fresh_password, results):
        """NUF Step 1: POST register returns 200 with token + user_id."""
        results.start_test("register_new_user", SECTION_REG, f"email={fresh_email}")
        try:
            client = APIClient(TEST_BASE_URL)
            resp = client.register(fresh_email, fresh_password)
            data = resp.json()
            results.add_step("POST", f"/api/auth/register → {resp.status_code}")
            results.set_output(str({k: data.get(k) for k in ["user_id", "email", "token_type"]}))
            ok = (
                resp.status_code == 200
                and "access_token" in data
                and data.get("user_id") is not None
                and data.get("email") == fresh_email
            )
            results.set_passed(ok)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    def test_register_duplicate_email(self, fresh_email, fresh_password, results):
        """NUF Step 1: Duplicate email returns 400."""
        results.start_test("register_duplicate_email", SECTION_REG, f"email={fresh_email} (already exists)")
        try:
            client = APIClient(TEST_BASE_URL)
            resp = client.register(fresh_email, fresh_password)
            results.add_step("POST", f"/api/auth/register → {resp.status_code}")
            results.set_output(resp.text[:200])
            results.set_passed(resp.status_code == 400)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    def test_register_short_password(self, results):
        """NUF Step 1: Password < 5 chars returns 422."""
        results.start_test("register_short_password", SECTION_REG, "password='ab'")
        try:
            client = APIClient(TEST_BASE_URL)
            ts = int(time.time())
            email = f"shortpw_{ts}@test.example.com"
            resp = client.register(email, "ab")
            results.add_step("POST", f"/api/auth/register → {resp.status_code}")
            results.set_output(resp.text[:200])
            results.set_passed(resp.status_code in (400, 422))
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()


# ═══════════════════════════════════════════════════════════════════════════
# Login tests (NUF Step 2)
# ═══════════════════════════════════════════════════════════════════════════


class TestLogin:

    def test_login_valid(self, fresh_email, fresh_password, results):
        """NUF Step 2: POST login (form-encoded) returns 200 with token."""
        results.start_test("login_valid", SECTION_LOGIN, f"email={fresh_email}")
        try:
            client = APIClient(TEST_BASE_URL)
            resp = client.login(fresh_email, fresh_password)
            data = resp.json()
            results.add_step("POST", f"/api/auth/login → {resp.status_code}")
            results.set_output(str({k: data.get(k) for k in ["user_id", "email", "token_type"]}))
            ok = (
                resp.status_code == 200
                and "access_token" in data
                and data.get("email") == fresh_email
            )
            results.set_passed(ok)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    def test_login_wrong_password(self, fresh_email, results):
        """NUF Step 2: Wrong password returns 401."""
        results.start_test("login_wrong_password", SECTION_LOGIN, f"email={fresh_email}, password=wrong")
        try:
            client = APIClient(TEST_BASE_URL)
            resp = client.login(fresh_email, "wrongpassword999")
            results.add_step("POST", f"/api/auth/login → {resp.status_code}")
            results.set_output(resp.text[:200])
            results.set_passed(resp.status_code == 401)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    def test_login_nonexistent(self, results):
        """NUF Step 2: Unknown email returns 401."""
        results.start_test("login_nonexistent", SECTION_LOGIN, "email=nobody_exists@test.example.com")
        try:
            client = APIClient(TEST_BASE_URL)
            resp = client.login("nobody_exists@test.example.com", "anything")
            results.add_step("POST", f"/api/auth/login → {resp.status_code}")
            results.set_output(resp.text[:200])
            results.set_passed(resp.status_code == 401)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()


# ═══════════════════════════════════════════════════════════════════════════
# Cross-cutting tests
# ═══════════════════════════════════════════════════════════════════════════


class TestCrossCutting:

    def test_tables_list_empty(self, fresh_email, fresh_password, results):
        """NUF Step 3: GET /tables returns empty list for new user."""
        results.start_test("tables_list_empty", SECTION_CROSS, "GET /api/tables (new user)")
        try:
            client = APIClient(TEST_BASE_URL)
            client.login(fresh_email, fresh_password)
            resp = client.get("/api/tables")
            data = resp.json()
            results.add_step("GET", f"/api/tables → {resp.status_code}")
            results.set_output(f"tables count: {len(data)}")
            results.set_passed(resp.status_code == 200 and isinstance(data, list) and len(data) == 0)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    def test_auth_required(self, results):
        """Cross: GET /tables without token returns 401."""
        results.start_test("auth_required", SECTION_CROSS, "GET /api/tables (no token)")
        try:
            client = APIClient(TEST_BASE_URL)
            resp = client.get("/api/tables")
            results.add_step("GET", f"/api/tables → {resp.status_code}")
            results.set_output(resp.text[:200])
            results.set_passed(resp.status_code == 401)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()

    def test_profile_accessible(self, fresh_email, fresh_password, results):
        """Cross: GET /user/me returns email."""
        results.start_test("profile_accessible", SECTION_CROSS, "GET /api/user/me")
        try:
            client = APIClient(TEST_BASE_URL)
            client.login(fresh_email, fresh_password)
            resp = client.get("/api/user/me")
            data = resp.json()
            results.add_step("GET", f"/api/user/me → {resp.status_code}")
            results.set_output(str({k: data.get(k) for k in ["email", "user_id", "is_active"]}))
            ok = (
                resp.status_code == 200
                and data.get("email") == fresh_email
            )
            results.set_passed(ok)
        except Exception as e:
            results.set_error(str(e))
        results.finish_test()
