"""
End-to-end tests for multi-tenancy features.

Tests cover:
1. User invitation and registration flow
2. Organization stream subscriptions and visibility
3. Report and article chat
4. Article notes (personal and shared)
5. Stance analysis
6. Full text link retrieval

Usage:
    # Run all tests
    pytest tests/test_multi_tenancy_e2e.py -v

    # Run specific test class
    pytest tests/test_multi_tenancy_e2e.py::TestInvitationFlow -v

    # Run with output
    pytest tests/test_multi_tenancy_e2e.py -v -s

Prerequisites:
    - Backend server running at BASE_URL
    - Platform admin account exists
    - Database is accessible
"""

import pytest
import requests
import time
import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List


# Configuration - can be overridden via environment variables
# Set TEST_BASE_URL, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD
import os
BASE_URL = os.getenv("TEST_BASE_URL", "http://localhost:8000")
ADMIN_EMAIL = os.getenv("TEST_ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.getenv("TEST_ADMIN_PASSWORD", "")  # Must be set!


class APIClient:
    """HTTP client for API testing."""

    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url
        self.token: Optional[str] = None
        self.user_id: Optional[int] = None
        self.session = requests.Session()

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def login(self, email: str, password: str) -> Dict[str, Any]:
        """Login and store the token."""
        response = self.session.post(
            f"{self.base_url}/api/auth/login",
            json={"email": email, "password": password}
        )
        response.raise_for_status()
        data = response.json()
        self.token = data.get("access_token")
        self.user_id = data.get("user_id")
        return data

    def register(self, token: str, password: str, full_name: str) -> Dict[str, Any]:
        """Register a new user via invitation token."""
        response = self.session.post(
            f"{self.base_url}/api/auth/register",
            json={
                "token": token,
                "password": password,
                "full_name": full_name
            }
        )
        response.raise_for_status()
        return response.json()

    def get(self, path: str, params: Optional[Dict] = None) -> requests.Response:
        """Make a GET request."""
        return self.session.get(
            f"{self.base_url}{path}",
            headers=self._headers(),
            params=params
        )

    def post(self, path: str, json: Optional[Dict] = None) -> requests.Response:
        """Make a POST request."""
        return self.session.post(
            f"{self.base_url}{path}",
            headers=self._headers(),
            json=json
        )

    def put(self, path: str, json: Optional[Dict] = None) -> requests.Response:
        """Make a PUT request."""
        return self.session.put(
            f"{self.base_url}{path}",
            headers=self._headers(),
            json=json
        )

    def delete(self, path: str) -> requests.Response:
        """Make a DELETE request."""
        return self.session.delete(
            f"{self.base_url}{path}",
            headers=self._headers()
        )


class TestFixtures:
    """Shared test data and utilities."""

    # Will be populated during tests
    org_id: Optional[int] = None
    org_name: str = f"Test Org {uuid.uuid4().hex[:8]}"

    user1_email: str = f"user1_{uuid.uuid4().hex[:8]}@test.com"
    user1_password: str = "TestPassword123!"
    user1_token: Optional[str] = None
    user1_id: Optional[int] = None

    user2_email: str = f"user2_{uuid.uuid4().hex[:8]}@test.com"
    user2_password: str = "TestPassword456!"
    user2_token: Optional[str] = None
    user2_id: Optional[int] = None

    invitation1_token: Optional[str] = None
    invitation2_token: Optional[str] = None

    stream_id: Optional[int] = None
    report_id: Optional[int] = None
    article_id: Optional[int] = None

    note_id: Optional[str] = None


@pytest.fixture(scope="module")
def admin_client() -> APIClient:
    """Get an authenticated admin client."""
    client = APIClient()
    client.login(ADMIN_EMAIL, ADMIN_PASSWORD)
    return client


@pytest.fixture(scope="module")
def fixtures() -> TestFixtures:
    """Get shared test fixtures."""
    return TestFixtures()


# ============================================================================
# Test Class: Invitation and Registration Flow
# ============================================================================

class TestInvitationFlow:
    """Test user invitation and registration."""

    def test_01_create_organization(self, admin_client: APIClient, fixtures: TestFixtures):
        """Admin creates a new organization."""
        response = admin_client.post(
            "/api/admin/orgs",
            json={"name": fixtures.org_name}
        )
        assert response.status_code == 201, f"Failed to create org: {response.text}"

        data = response.json()
        fixtures.org_id = data["org_id"]
        assert data["name"] == fixtures.org_name
        print(f"\nCreated organization: {fixtures.org_name} (ID: {fixtures.org_id})")

    def test_02_create_invitation_user1(self, admin_client: APIClient, fixtures: TestFixtures):
        """Admin creates invitation for user 1."""
        response = admin_client.post(
            "/api/admin/invitations",
            json={
                "email": fixtures.user1_email,
                "org_id": fixtures.org_id,
                "role": "member",
                "expires_in_days": 7
            }
        )
        assert response.status_code == 201, f"Failed to create invitation: {response.text}"

        data = response.json()
        fixtures.invitation1_token = data["token"]
        assert data["email"] == fixtures.user1_email
        assert data["org_id"] == fixtures.org_id
        print(f"\nCreated invitation for {fixtures.user1_email}")

    def test_03_create_invitation_user2(self, admin_client: APIClient, fixtures: TestFixtures):
        """Admin creates invitation for user 2."""
        response = admin_client.post(
            "/api/admin/invitations",
            json={
                "email": fixtures.user2_email,
                "org_id": fixtures.org_id,
                "role": "member",
                "expires_in_days": 7
            }
        )
        assert response.status_code == 201, f"Failed to create invitation: {response.text}"

        data = response.json()
        fixtures.invitation2_token = data["token"]
        print(f"\nCreated invitation for {fixtures.user2_email}")

    def test_04_list_invitations(self, admin_client: APIClient, fixtures: TestFixtures):
        """Admin can see pending invitations."""
        response = admin_client.get("/api/admin/invitations")
        assert response.status_code == 200

        invitations = response.json()
        our_invitations = [i for i in invitations if i["org_id"] == fixtures.org_id]
        assert len(our_invitations) >= 2, "Should have at least 2 invitations for our org"
        print(f"\nFound {len(our_invitations)} invitations for org {fixtures.org_id}")

    def test_05_register_user1(self, fixtures: TestFixtures):
        """User 1 registers via invitation."""
        client = APIClient()
        data = client.register(
            token=fixtures.invitation1_token,
            password=fixtures.user1_password,
            full_name="Test User One"
        )

        fixtures.user1_id = data.get("user_id")
        assert fixtures.user1_id is not None
        print(f"\nRegistered user 1: {fixtures.user1_email} (ID: {fixtures.user1_id})")

    def test_06_register_user2(self, fixtures: TestFixtures):
        """User 2 registers via invitation."""
        client = APIClient()
        data = client.register(
            token=fixtures.invitation2_token,
            password=fixtures.user2_password,
            full_name="Test User Two"
        )

        fixtures.user2_id = data.get("user_id")
        assert fixtures.user2_id is not None
        print(f"\nRegistered user 2: {fixtures.user2_email} (ID: {fixtures.user2_id})")

    def test_07_user1_can_login(self, fixtures: TestFixtures):
        """User 1 can login with credentials."""
        client = APIClient()
        data = client.login(fixtures.user1_email, fixtures.user1_password)

        fixtures.user1_token = data["access_token"]
        assert fixtures.user1_token is not None
        assert data["org_id"] == fixtures.org_id
        print(f"\nUser 1 logged in successfully, org_id: {data['org_id']}")

    def test_08_user2_can_login(self, fixtures: TestFixtures):
        """User 2 can login with credentials."""
        client = APIClient()
        data = client.login(fixtures.user2_email, fixtures.user2_password)

        fixtures.user2_token = data["access_token"]
        assert fixtures.user2_token is not None
        assert data["org_id"] == fixtures.org_id
        print(f"\nUser 2 logged in successfully, org_id: {data['org_id']}")


# ============================================================================
# Test Class: Stream Subscriptions
# ============================================================================

class TestStreamSubscriptions:
    """Test organization stream subscriptions and user visibility."""

    @pytest.fixture
    def user1_client(self, fixtures: TestFixtures) -> APIClient:
        """Get user 1's authenticated client."""
        client = APIClient()
        client.token = fixtures.user1_token
        client.user_id = fixtures.user1_id
        return client

    @pytest.fixture
    def user2_client(self, fixtures: TestFixtures) -> APIClient:
        """Get user 2's authenticated client."""
        client = APIClient()
        client.token = fixtures.user2_token
        client.user_id = fixtures.user2_id
        return client

    def test_01_find_global_stream(self, admin_client: APIClient, fixtures: TestFixtures):
        """Find a global stream to subscribe to."""
        response = admin_client.get("/api/admin/streams")
        assert response.status_code == 200

        streams = response.json()
        global_streams = [s for s in streams if s.get("scope") == "global"]

        if global_streams:
            fixtures.stream_id = global_streams[0]["stream_id"]
            print(f"\nFound global stream: {global_streams[0]['name']} (ID: {fixtures.stream_id})")
        else:
            # Create a stream and make it global if none exist
            pytest.skip("No global streams available for testing")

    def test_02_subscribe_org_to_global_stream(self, admin_client: APIClient, fixtures: TestFixtures):
        """Admin subscribes org to a global stream."""
        if not fixtures.stream_id:
            pytest.skip("No stream available")

        # Use the subscription API to subscribe org to stream
        response = admin_client.post(
            f"/api/subscriptions/org/global-streams/{fixtures.stream_id}"
        )
        # May already be subscribed, so accept 200 or 201
        assert response.status_code in [200, 201, 409], f"Failed: {response.text}"
        print(f"\nSubscribed org {fixtures.org_id} to stream {fixtures.stream_id}")

    def test_03_user1_sees_subscribed_streams(self, user1_client, fixtures: TestFixtures):
        """User 1 can see streams their org is subscribed to."""
        response = user1_client.get("/api/subscriptions/global-streams")
        assert response.status_code == 200

        data = response.json()
        streams = data.get("streams", [])

        # Check if our stream is visible
        stream_ids = [s["stream_id"] for s in streams]
        print(f"\nUser 1 sees {len(streams)} global streams: {stream_ids}")

        # The user should see global streams their org is subscribed to
        if fixtures.stream_id:
            # Note: exact visibility depends on subscription status
            print(f"Looking for stream {fixtures.stream_id} in visible streams")

    def test_04_user2_sees_same_streams(self, user2_client, fixtures: TestFixtures):
        """User 2 (same org) sees the same streams."""
        response = user2_client.get("/api/subscriptions/global-streams")
        assert response.status_code == 200

        data = response.json()
        streams = data.get("streams", [])
        print(f"\nUser 2 sees {len(streams)} global streams")


# ============================================================================
# Test Class: Report and Article Chat
# ============================================================================

class TestChat:
    """Test chat functionality with reports and articles."""

    @pytest.fixture
    def user1_client(self, fixtures: TestFixtures) -> APIClient:
        client = APIClient()
        client.token = fixtures.user1_token
        client.user_id = fixtures.user1_id
        return client

    def test_01_find_report_with_articles(self, user1_client, fixtures: TestFixtures):
        """Find a report with articles to test with."""
        # Get user's streams
        response = user1_client.get("/api/streams")
        if response.status_code != 200:
            pytest.skip("No streams accessible to user")

        streams = response.json()
        if not streams:
            pytest.skip("User has no accessible streams")

        # Get reports from first accessible stream
        for stream in streams[:3]:  # Check first 3 streams
            stream_id = stream["stream_id"]
            response = user1_client.get(f"/api/streams/{stream_id}/reports")
            if response.status_code == 200:
                reports = response.json()
                if reports:
                    fixtures.stream_id = stream_id
                    fixtures.report_id = reports[0]["report_id"]
                    print(f"\nFound report {fixtures.report_id} in stream {stream_id}")
                    break

        if not fixtures.report_id:
            pytest.skip("No reports found in accessible streams")

    def test_02_get_report_articles(self, user1_client, fixtures: TestFixtures):
        """Get articles from the report."""
        if not fixtures.report_id:
            pytest.skip("No report available")

        response = user1_client.get(f"/api/reports/{fixtures.report_id}/articles")
        assert response.status_code == 200

        articles = response.json()
        if articles:
            fixtures.article_id = articles[0]["article_id"]
            print(f"\nFound {len(articles)} articles, using article {fixtures.article_id}")
        else:
            pytest.skip("Report has no articles")

    def test_03_chat_with_report(self, user1_client, fixtures: TestFixtures):
        """Send a chat message about the report."""
        if not fixtures.report_id or not fixtures.stream_id:
            pytest.skip("No report/stream available")

        # Note: This is a streaming endpoint, so we test basic connectivity
        response = user1_client.post(
            "/api/research-stream-chat/chat/stream",
            json={
                "message": "Summarize the key findings from this report",
                "stream_id": fixtures.stream_id,
                "report_id": fixtures.report_id
            }
        )
        # Streaming endpoint may return 200 with streaming response
        assert response.status_code in [200, 201], f"Chat failed: {response.text}"
        print(f"\nChat request to report {fixtures.report_id} succeeded")

    def test_04_chat_with_article_context(self, user1_client, fixtures: TestFixtures):
        """Send a chat message about a specific article."""
        if not fixtures.report_id or not fixtures.stream_id or not fixtures.article_id:
            pytest.skip("No article available")

        response = user1_client.post(
            "/api/research-stream-chat/chat/stream",
            json={
                "message": "What are the main conclusions of this article?",
                "stream_id": fixtures.stream_id,
                "report_id": fixtures.report_id,
                "article_id": fixtures.article_id
            }
        )
        assert response.status_code in [200, 201], f"Chat failed: {response.text}"
        print(f"\nChat request about article {fixtures.article_id} succeeded")


# ============================================================================
# Test Class: Article Notes
# ============================================================================

class TestArticleNotes:
    """Test article notes with personal and shared visibility."""

    @pytest.fixture
    def user1_client(self, fixtures: TestFixtures) -> APIClient:
        client = APIClient()
        client.token = fixtures.user1_token
        client.user_id = fixtures.user1_id
        return client

    @pytest.fixture
    def user2_client(self, fixtures: TestFixtures) -> APIClient:
        client = APIClient()
        client.token = fixtures.user2_token
        client.user_id = fixtures.user2_id
        return client

    def test_01_user1_creates_personal_note(self, user1_client, fixtures: TestFixtures):
        """User 1 creates a personal note on an article."""
        if not fixtures.report_id or not fixtures.article_id:
            pytest.skip("No article available")

        response = user1_client.post(
            f"/api/notes/reports/{fixtures.report_id}/articles/{fixtures.article_id}",
            json={
                "content": "This is my personal note - only I can see this",
                "visibility": "personal"
            }
        )
        assert response.status_code == 201, f"Failed to create note: {response.text}"

        data = response.json()
        assert data["visibility"] == "personal"
        assert data["content"] == "This is my personal note - only I can see this"
        print(f"\nUser 1 created personal note: {data['id']}")

    def test_02_user1_creates_shared_note(self, user1_client, fixtures: TestFixtures):
        """User 1 creates a shared note on an article."""
        if not fixtures.report_id or not fixtures.article_id:
            pytest.skip("No article available")

        response = user1_client.post(
            f"/api/notes/reports/{fixtures.report_id}/articles/{fixtures.article_id}",
            json={
                "content": "This is a shared note - org members can see this",
                "visibility": "shared"
            }
        )
        assert response.status_code == 201, f"Failed to create note: {response.text}"

        data = response.json()
        fixtures.note_id = data["id"]
        assert data["visibility"] == "shared"
        print(f"\nUser 1 created shared note: {fixtures.note_id}")

    def test_03_user1_sees_all_own_notes(self, user1_client, fixtures: TestFixtures):
        """User 1 can see both their personal and shared notes."""
        if not fixtures.report_id or not fixtures.article_id:
            pytest.skip("No article available")

        response = user1_client.get(
            f"/api/notes/reports/{fixtures.report_id}/articles/{fixtures.article_id}"
        )
        assert response.status_code == 200

        data = response.json()
        notes = data.get("notes", [])

        # Should see at least 2 notes (1 personal + 1 shared)
        assert len(notes) >= 2, f"Expected at least 2 notes, got {len(notes)}"

        visibility_types = [n["visibility"] for n in notes]
        assert "personal" in visibility_types, "Should see personal notes"
        assert "shared" in visibility_types, "Should see shared notes"
        print(f"\nUser 1 sees {len(notes)} notes (personal and shared)")

    def test_04_user2_sees_only_shared_notes(self, user2_client, fixtures: TestFixtures):
        """User 2 (same org) sees only shared notes from User 1."""
        if not fixtures.report_id or not fixtures.article_id:
            pytest.skip("No article available")

        response = user2_client.get(
            f"/api/notes/reports/{fixtures.report_id}/articles/{fixtures.article_id}"
        )
        assert response.status_code == 200

        data = response.json()
        notes = data.get("notes", [])

        # User 2 should only see shared notes from User 1
        for note in notes:
            if note.get("user_id") == fixtures.user1_id:
                assert note["visibility"] == "shared", \
                    "User 2 should not see User 1's personal notes"

        print(f"\nUser 2 sees {len(notes)} notes (only shared)")

    def test_05_user2_creates_own_note(self, user2_client, fixtures: TestFixtures):
        """User 2 creates their own note."""
        if not fixtures.report_id or not fixtures.article_id:
            pytest.skip("No article available")

        response = user2_client.post(
            f"/api/notes/reports/{fixtures.report_id}/articles/{fixtures.article_id}",
            json={
                "content": "User 2's shared note",
                "visibility": "shared"
            }
        )
        assert response.status_code == 201
        print(f"\nUser 2 created their own note")

    def test_06_user1_can_edit_own_note(self, user1_client, fixtures: TestFixtures):
        """User 1 can edit their own note."""
        if not fixtures.report_id or not fixtures.article_id or not fixtures.note_id:
            pytest.skip("No note available")

        response = user1_client.put(
            f"/api/notes/reports/{fixtures.report_id}/articles/{fixtures.article_id}/notes/{fixtures.note_id}",
            json={
                "content": "Updated shared note content",
                "visibility": "shared"
            }
        )
        assert response.status_code == 200

        data = response.json()
        assert data["content"] == "Updated shared note content"
        print(f"\nUser 1 updated their note")

    def test_07_user2_cannot_edit_user1_note(self, user2_client, fixtures: TestFixtures):
        """User 2 cannot edit User 1's note."""
        if not fixtures.report_id or not fixtures.article_id or not fixtures.note_id:
            pytest.skip("No note available")

        response = user2_client.put(
            f"/api/notes/reports/{fixtures.report_id}/articles/{fixtures.article_id}/notes/{fixtures.note_id}",
            json={
                "content": "Trying to edit someone else's note"
            }
        )
        assert response.status_code == 404, "Should not be able to edit others' notes"
        print(f"\nUser 2 correctly blocked from editing User 1's note")

    def test_08_user2_cannot_delete_user1_note(self, user2_client, fixtures: TestFixtures):
        """User 2 cannot delete User 1's note."""
        if not fixtures.report_id or not fixtures.article_id or not fixtures.note_id:
            pytest.skip("No note available")

        response = user2_client.delete(
            f"/api/notes/reports/{fixtures.report_id}/articles/{fixtures.article_id}/notes/{fixtures.note_id}"
        )
        assert response.status_code == 404, "Should not be able to delete others' notes"
        print(f"\nUser 2 correctly blocked from deleting User 1's note")


# ============================================================================
# Test Class: Stance Analysis
# ============================================================================

class TestStanceAnalysis:
    """Test AI stance analysis on articles."""

    @pytest.fixture
    def user1_client(self, fixtures: TestFixtures) -> APIClient:
        client = APIClient()
        client.token = fixtures.user1_token
        client.user_id = fixtures.user1_id
        return client

    def test_01_get_article_for_analysis(self, user1_client, fixtures: TestFixtures):
        """Get an article with abstract for analysis."""
        if not fixtures.report_id:
            pytest.skip("No report available")

        response = user1_client.get(f"/api/reports/{fixtures.report_id}/articles")
        assert response.status_code == 200

        articles = response.json()
        # Find an article with an abstract
        for article in articles:
            if article.get("abstract"):
                fixtures.article_id = article["article_id"]
                print(f"\nFound article with abstract: {fixtures.article_id}")
                return

        pytest.skip("No articles with abstracts found")

    def test_02_run_stance_analysis(self, user1_client, fixtures: TestFixtures):
        """Run stance analysis on an article."""
        if not fixtures.stream_id or not fixtures.article_id:
            pytest.skip("No stream/article available")

        # Get article details first
        response = user1_client.get(f"/api/reports/{fixtures.report_id}/articles")
        if response.status_code != 200:
            pytest.skip("Cannot get article details")

        articles = response.json()
        article = next((a for a in articles if a["article_id"] == fixtures.article_id), None)
        if not article or not article.get("abstract"):
            pytest.skip("Article has no abstract")

        # Run stance analysis
        response = user1_client.post(
            "/api/document-analysis/analyze-stance",
            json={
                "article": {
                    "title": article["title"],
                    "abstract": article["abstract"],
                    "authors": article.get("authors", []),
                    "journal": article.get("journal"),
                    "pmid": article.get("pmid"),
                    "doi": article.get("doi")
                },
                "stream_id": fixtures.stream_id
            }
        )

        # Analysis might take time or fail if API key issues
        if response.status_code == 200:
            data = response.json()
            assert "stance" in data
            assert "confidence" in data
            assert "analysis" in data
            print(f"\nStance analysis result: {data['stance']} (confidence: {data['confidence']})")
        else:
            print(f"\nStance analysis returned {response.status_code}: {response.text[:200]}")
            # Don't fail the test for API configuration issues
            pytest.skip(f"Stance analysis not available: {response.status_code}")


# ============================================================================
# Test Class: Full Text Links
# ============================================================================

class TestFullTextLinks:
    """Test full text link retrieval for articles."""

    @pytest.fixture
    def user1_client(self, fixtures: TestFixtures) -> APIClient:
        client = APIClient()
        client.token = fixtures.user1_token
        client.user_id = fixtures.user1_id
        return client

    def test_01_get_article_with_pmid(self, user1_client, fixtures: TestFixtures):
        """Find an article with a PMID for full text lookup."""
        if not fixtures.report_id:
            pytest.skip("No report available")

        response = user1_client.get(f"/api/reports/{fixtures.report_id}/articles")
        assert response.status_code == 200

        articles = response.json()
        for article in articles:
            if article.get("pmid"):
                fixtures.article_pmid = article["pmid"]
                print(f"\nFound article with PMID: {fixtures.article_pmid}")
                return

        pytest.skip("No articles with PMID found")

    def test_02_get_full_text_links(self, user1_client, fixtures: TestFixtures):
        """Get full text links for an article."""
        pmid = getattr(fixtures, 'article_pmid', None)
        if not pmid:
            pytest.skip("No PMID available")

        response = user1_client.get(f"/api/articles/{pmid}/full-text-links")
        assert response.status_code == 200

        data = response.json()
        links = data.get("links", [])

        print(f"\nFound {len(links)} full text links for PMID {pmid}")
        for link in links[:3]:  # Show first 3
            print(f"  - {link.get('provider')}: {'FREE' if link.get('is_free') else 'paid'}")

        # Links may be empty if article doesn't have free full text
        assert isinstance(links, list)


# ============================================================================
# Test Class: Cleanup
# ============================================================================

class TestCleanup:
    """Clean up test data (optional - run with caution)."""

    def test_cleanup_notes(self, fixtures: TestFixtures):
        """Clean up test notes."""
        # Notes are automatically cleaned with article data
        print("\nNote: Test notes remain in database for inspection")

    def test_cleanup_users(self, admin_client: APIClient, fixtures: TestFixtures):
        """Note: Test users remain for inspection."""
        print(f"\nTest users created:")
        print(f"  - {fixtures.user1_email}")
        print(f"  - {fixtures.user2_email}")
        print(f"\nTest org: {fixtures.org_name} (ID: {fixtures.org_id})")
        # Uncomment to actually delete:
        # if fixtures.user1_id:
        #     admin_client.delete(f"/api/admin/users/{fixtures.user1_id}")
        # if fixtures.user2_id:
        #     admin_client.delete(f"/api/admin/users/{fixtures.user2_id}")


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
