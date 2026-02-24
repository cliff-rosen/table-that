"""
Pytest configuration and shared fixtures for multi-tenancy tests.

Configure test settings by setting environment variables or editing the values below.
"""

import os
import pytest


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


@pytest.fixture(scope="session")
def test_config():
    """Provide test configuration."""
    return {
        "base_url": TEST_BASE_URL,
        "admin_email": TEST_ADMIN_EMAIL,
        "admin_password": TEST_ADMIN_PASSWORD
    }


def pytest_collection_modifyitems(config, items):
    """Automatically mark all tests in tests directory as e2e tests."""
    for item in items:
        if "tests" in str(item.fspath):
            item.add_marker(pytest.mark.e2e)
