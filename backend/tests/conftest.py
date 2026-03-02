"""
Pytest configuration and shared fixtures.

Configure test settings by setting environment variables or editing the values below.
"""

import os
import time
import uuid
from typing import List

import pytest
import requests


# Test configuration - override via environment variables
TEST_BASE_URL = os.getenv("TEST_BASE_URL", "http://localhost:8000")
TEST_ADMIN_EMAIL = os.getenv("TEST_ADMIN_EMAIL", "admin@example.com")
TEST_ADMIN_PASSWORD = os.getenv("TEST_ADMIN_PASSWORD", "adminpassword")


def pytest_configure(config):
    """Configure custom markers."""
    config.addinivalue_line(
        "markers", "e2e: mark test as end-to-end test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow running"
    )


def pytest_collection_modifyitems(config, items):
    """Automatically mark all tests in tests directory as e2e tests."""
    for item in items:
        if "tests" in str(item.fspath):
            item.add_marker(pytest.mark.e2e)


# ═══════════════════════════════════════════════════════════════════════════
# APIClient — HTTP client for flow tests
# ═══════════════════════════════════════════════════════════════════════════


class APIClient:
    """HTTP client wrapping requests.Session with auth helpers."""

    def __init__(self, base_url: str = TEST_BASE_URL):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.token: str | None = None
        self.user_id: int | None = None

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def _headers(self) -> dict:
        headers = {}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def register(self, email: str, password: str) -> requests.Response:
        """POST /api/auth/register (JSON body)."""
        resp = self.session.post(
            self._url("/api/auth/register"),
            json={"email": email, "password": password},
        )
        if resp.status_code == 200:
            data = resp.json()
            self.token = data.get("access_token")
            self.user_id = data.get("user_id")
        return resp

    def login(self, email: str, password: str) -> requests.Response:
        """POST /api/auth/login (form-encoded, field name 'username')."""
        resp = self.session.post(
            self._url("/api/auth/login"),
            data={"username": email, "password": password},
        )
        if resp.status_code == 200:
            data = resp.json()
            self.token = data.get("access_token")
            self.user_id = data.get("user_id")
        return resp

    def get(self, path: str, **kwargs) -> requests.Response:
        return self.session.get(self._url(path), headers=self._headers(), **kwargs)

    def post(self, path: str, **kwargs) -> requests.Response:
        return self.session.post(self._url(path), headers=self._headers(), **kwargs)

    def put(self, path: str, **kwargs) -> requests.Response:
        return self.session.put(self._url(path), headers=self._headers(), **kwargs)

    def delete(self, path: str, **kwargs) -> requests.Response:
        return self.session.delete(self._url(path), headers=self._headers(), **kwargs)


# ═══════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════


@pytest.fixture(scope="session")
def test_config():
    """Provide test configuration."""
    return {
        "base_url": TEST_BASE_URL,
        "admin_email": TEST_ADMIN_EMAIL,
        "admin_password": TEST_ADMIN_PASSWORD
    }


@pytest.fixture(scope="module")
def api_client():
    """Unauthenticated APIClient."""
    return APIClient(TEST_BASE_URL)


@pytest.fixture(scope="module")
def test_user_email():
    """Unique email per module."""
    ts = int(time.time())
    short_id = uuid.uuid4().hex[:6]
    return f"test_{ts}_{short_id}@test.example.com"


@pytest.fixture(scope="module")
def test_user_password():
    """Standard test password."""
    return "TestPass123!"


@pytest.fixture(scope="module")
def authed_client(test_user_email, test_user_password):
    """Register a fresh user and return an authenticated APIClient."""
    client = APIClient(TEST_BASE_URL)
    resp = client.register(test_user_email, test_user_password)
    assert resp.status_code == 200, f"Registration failed: {resp.text}"
    return client


@pytest.fixture
def table_lifecycle(authed_client):
    """Factory that creates tables and deletes them on teardown."""
    created_ids: List[int] = []

    def _create(name: str, columns: list, description: str = ""):
        resp = authed_client.post("/api/tables", json={
            "name": name,
            "description": description,
            "columns": columns,
        })
        assert resp.status_code == 201, f"Table creation failed: {resp.text}"
        table_id = resp.json()["id"]
        created_ids.append(table_id)
        return resp.json()

    yield _create

    # Teardown: delete all tables created during the test
    for tid in created_ids:
        try:
            authed_client.delete(f"/api/tables/{tid}")
        except Exception:
            pass


@pytest.fixture
async def db():
    """Provide an async DB session for a single test."""
    from database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        yield session
