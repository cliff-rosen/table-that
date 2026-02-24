"""
Login Email Service

Service for sending login tokens and password reset emails.
Delegates actual email sending to EmailService.
"""

import secrets
from datetime import datetime, timedelta
import logging

from config.settings import settings
from services.email_service import get_email_service

logger = logging.getLogger(__name__)


class LoginEmailService:
    """Service for sending login token and password reset emails"""

    def __init__(self):
        self.app_name = settings.APP_NAME
        self.frontend_url = settings.FRONTEND_URL
        self.email_service = get_email_service()

    def generate_login_token(self) -> tuple[str, datetime]:
        """
        Generate a secure login token and expiration time.

        Returns:
            tuple: (token, expiration_datetime)
        """
        token = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(minutes=30)
        return token, expires_at

    def generate_password_reset_token(self) -> tuple[str, datetime]:
        """
        Generate a secure password reset token and expiration time.

        Returns:
            tuple: (token, expiration_datetime)
        """
        token = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(hours=1)
        return token, expires_at

    async def send_login_token(self, email: str, token: str) -> bool:
        """
        Send login token email to user.

        Args:
            email: User's email address
            token: Login token

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        login_url = f"{self.frontend_url}/auth/token-login?token={token}"

        subject = f"{self.app_name} - One-Click Login"
        body = f"""Hello!

You requested a one-click login for {self.app_name}.

Click the link below to log in (expires in 30 minutes):
{login_url}

If you didn't request this login, you can safely ignore this email.

Best regards,
The {self.app_name} Team
"""
        return await self.email_service.send_text_email(email, subject, body)

    async def send_password_reset_token(self, email: str, token: str) -> bool:
        """
        Send password reset email to user.

        Args:
            email: User's email address
            token: Password reset token

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        reset_url = f"{self.frontend_url}/reset-password?token={token}"

        subject = f"{self.app_name} - Password Reset"
        body = f"""Hello!

You requested a password reset for your {self.app_name} account.

Click the link below to reset your password (expires in 1 hour):
{reset_url}

If you didn't request this password reset, you can safely ignore this email.
Your password will remain unchanged.

Best regards,
The {self.app_name} Team
"""
        return await self.email_service.send_text_email(email, subject, body)

    async def send_test_email(self) -> bool:
        """
        Send a simple test email to verify SMTP configuration.

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        test_email = "cliff.rosen@gmail.com"
        logger.info(f"Attempting to send test email to {test_email}")

        subject = f"Test Email from {self.app_name}"
        body = f"""This is a test email from the {self.app_name} login service.

The email system is working correctly!

Best regards,
The {self.app_name} Team
"""
        return await self.email_service.send_text_email(test_email, subject, body)
