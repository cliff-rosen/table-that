"""
Email Service

Centralized service for sending all emails.
All email sending in the application should go through this service.

Features:
- HTML emails (reports)
- Plain text emails (login tokens, password reset)
- Dev mode logging when SMTP not configured
"""

import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from typing import List, Optional, Dict

from config.settings import settings

logger = logging.getLogger(__name__)


# Singleton instance for easy access
_email_service_instance: Optional['EmailService'] = None


def get_email_service() -> 'EmailService':
    """Get the singleton EmailService instance"""
    global _email_service_instance
    if _email_service_instance is None:
        _email_service_instance = EmailService()
    return _email_service_instance


class EmailService:
    """General email sending service"""

    def __init__(self):
        self.smtp_server = settings.SMTP_SERVER
        self.smtp_port = settings.SMTP_PORT
        self.smtp_username = settings.SMTP_USERNAME
        self.smtp_password = settings.SMTP_PASSWORD
        self.from_email = settings.FROM_EMAIL or 'noreply@knowledgehorizon.com'
        self.app_name = settings.APP_NAME

    async def send_text_email(
        self,
        to_email: str,
        subject: str,
        body: str
    ) -> bool:
        """
        Send a plain text email.

        Args:
            to_email: Recipient email address
            subject: Email subject
            body: Plain text body content

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Check SMTP credentials
            if not self.smtp_username or not self.smtp_password:
                if settings.IS_PRODUCTION:
                    logger.error(f"SMTP credentials missing in production! Cannot send email to {to_email}")
                    return False
                else:
                    logger.info(f"DEV MODE: Would send email to {to_email}")
                    logger.info(f"DEV MODE: Subject: {subject}")
                    logger.info(f"DEV MODE: Body:\n{body}")
                    return True

            # Create message
            msg = MIMEText(body, 'plain')
            msg['Subject'] = subject
            msg['From'] = self.from_email
            msg['To'] = to_email

            # Send email
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.sendmail(self.from_email, [to_email], msg.as_string())

            logger.info(f"Text email sent successfully to {to_email}")
            return True

        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            self._log_smtp_error(e)
            return False

    async def send_html_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None,
        from_name: Optional[str] = None,
        images: Optional[Dict[str, bytes]] = None
    ) -> bool:
        """
        Send an HTML email.

        Args:
            to_email: Recipient email address
            subject: Email subject
            html_content: HTML body content
            text_content: Plain text fallback (optional, will be auto-generated if not provided)
            cc: List of CC recipients
            bcc: List of BCC recipients
            from_name: Display name for the From field (optional)
            images: Dict of Content-ID -> image bytes for embedded images

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Build From header with optional display name
            if from_name:
                from_header = f"{from_name} <{self.from_email}>"
            else:
                from_header = self.from_email

            # Check SMTP credentials
            if not self.smtp_username or not self.smtp_password:
                if settings.IS_PRODUCTION:
                    logger.error(f"SMTP credentials missing in production! Cannot send email to {to_email}")
                    return False
                else:
                    logger.info(f"DEV MODE: Would send email to {to_email}")
                    logger.info(f"DEV MODE: From: {from_header}")
                    logger.info(f"DEV MODE: Subject: {subject}")
                    logger.info(f"DEV MODE: HTML content length: {len(html_content)} chars")
                    if images:
                        logger.info(f"DEV MODE: Images: {list(images.keys())}")
                    return True

            # Create message structure
            # If we have images, use multipart/related as outer container
            if images:
                msg = MIMEMultipart('related')
                msg_alternative = MIMEMultipart('alternative')
                msg.attach(msg_alternative)
            else:
                msg = MIMEMultipart('alternative')
                msg_alternative = msg

            msg['Subject'] = subject
            msg['From'] = from_header
            msg['To'] = to_email

            if cc:
                msg['Cc'] = ', '.join(cc)
            if bcc:
                msg['Bcc'] = ', '.join(bcc)

            # Add plain text version (fallback)
            if not text_content:
                text_content = self._html_to_text(html_content)
            part1 = MIMEText(text_content, 'plain')
            msg_alternative.attach(part1)

            # Add HTML version
            part2 = MIMEText(html_content, 'html')
            msg_alternative.attach(part2)

            # Attach images with Content-ID
            if images:
                for cid, image_data in images.items():
                    img = MIMEImage(image_data)
                    img.add_header('Content-ID', f'<{cid}>')
                    img.add_header('Content-Disposition', 'inline', filename=f'{cid}.png')
                    msg.attach(img)

            # Build recipient list
            recipients = [to_email]
            if cc:
                recipients.extend(cc)
            if bcc:
                recipients.extend(bcc)

            # Send email
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.sendmail(self.from_email, recipients, msg.as_string())

            logger.info(f"HTML email sent successfully to {to_email}")
            return True

        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            self._log_smtp_error(e)
            return False

    async def send_report_email(
        self,
        to_email: str,
        report_name: str,
        html_content: str,
        cc: Optional[List[str]] = None,
        subject: Optional[str] = None,
        from_name: Optional[str] = None,
        images: Optional[Dict[str, bytes]] = None
    ) -> bool:
        """
        Send a report email.

        Args:
            to_email: Recipient email address
            report_name: Name of the report (used in subject if not provided)
            html_content: HTML report content
            cc: List of CC recipients
            subject: Custom subject line (optional, defaults to app_name + report_name)
            from_name: Custom from name (optional, defaults to app_name)
            images: Dict of Content-ID -> image bytes for embedded images

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        if not subject:
            subject = f"{self.app_name} Report: {report_name}"

        return await self.send_html_email(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            cc=cc,
            from_name=from_name,
            images=images
        )

    async def send_bulk_report_emails(
        self,
        recipients: List[str],
        report_name: str,
        html_content: str,
        subject: Optional[str] = None,
        from_name: Optional[str] = None,
        images: Optional[Dict[str, bytes]] = None
    ) -> dict:
        """
        Send a report to multiple recipients.

        Args:
            recipients: List of recipient email addresses
            report_name: Name of the report
            html_content: HTML report content
            subject: Custom subject line (optional)
            from_name: Custom from name (optional)
            images: Dict of Content-ID -> image bytes for embedded images

        Returns:
            dict: {'success': [emails], 'failed': [emails]}
        """
        results = {'success': [], 'failed': []}

        for email in recipients:
            success = await self.send_report_email(
                to_email=email,
                report_name=report_name,
                html_content=html_content,
                subject=subject,
                from_name=from_name,
                images=images
            )
            if success:
                results['success'].append(email)
            else:
                results['failed'].append(email)

        return results

    def _html_to_text(self, html: str) -> str:
        """
        Convert HTML to plain text (basic conversion for email fallback).
        """
        import re

        # Remove style and script tags and their content
        text = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL)
        text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL)

        # Replace common elements
        text = re.sub(r'<br\s*/?>', '\n', text)
        text = re.sub(r'</p>', '\n\n', text)
        text = re.sub(r'</div>', '\n', text)
        text = re.sub(r'</h[1-6]>', '\n\n', text)
        text = re.sub(r'</li>', '\n', text)

        # Remove all remaining HTML tags
        text = re.sub(r'<[^>]+>', '', text)

        # Decode HTML entities
        text = text.replace('&amp;', '&')
        text = text.replace('&lt;', '<')
        text = text.replace('&gt;', '>')
        text = text.replace('&nbsp;', ' ')
        text = text.replace('&bull;', '*')

        # Clean up whitespace
        text = re.sub(r'\n\s*\n\s*\n', '\n\n', text)
        text = text.strip()

        return text

    async def send_approval_request_email(
        self,
        recipient_email: str,
        recipient_name: str,
        report_id: int,
        report_name: str,
        stream_name: Optional[str],
        article_count: int,
        requester_name: str
    ) -> bool:
        """
        Send an approval request email to an admin.

        Args:
            recipient_email: Admin's email address
            recipient_name: Admin's display name
            report_id: ID of the report
            report_name: Name of the report
            stream_name: Name of the research stream
            article_count: Number of articles in the report
            requester_name: Name of the person requesting approval

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        # Build the curation URL
        base_url = settings.FRONTEND_URL or 'http://localhost:5173'
        curation_url = f"{base_url}/operations/reports/{report_id}/curate"

        subject = f"Report Approval Requested: {report_name}"

        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; padding: 24px; border-radius: 8px 8px 0 0; }}
        .content {{ background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; }}
        .metadata {{ background: white; padding: 16px; border-radius: 8px; margin: 16px 0; }}
        .metadata-row {{ display: flex; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }}
        .metadata-row:last-child {{ border-bottom: none; }}
        .metadata-label {{ color: #6b7280; width: 120px; }}
        .metadata-value {{ color: #111827; font-weight: 500; }}
        .button {{ display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; margin-top: 16px; }}
        .footer {{ text-align: center; padding: 16px; color: #6b7280; font-size: 12px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0; font-size: 20px;">Report Approval Requested</h1>
        </div>
        <div class="content">
            <p>Hi {recipient_name},</p>
            <p><strong>{requester_name}</strong> has requested your approval for a new report.</p>

            <div class="metadata">
                <div class="metadata-row">
                    <span class="metadata-label">Report:</span>
                    <span class="metadata-value">{report_name}</span>
                </div>
                <div class="metadata-row">
                    <span class="metadata-label">Stream:</span>
                    <span class="metadata-value">{stream_name or 'N/A'}</span>
                </div>
                <div class="metadata-row">
                    <span class="metadata-label">Articles:</span>
                    <span class="metadata-value">{article_count}</span>
                </div>
            </div>

            <p>Please review the report and approve or reject it.</p>

            <a href="{curation_url}" class="button">Review Report</a>
        </div>
        <div class="footer">
            {self.app_name} &bull; Research Intelligence Platform
        </div>
    </div>
</body>
</html>
"""

        return await self.send_html_email(
            to_email=recipient_email,
            subject=subject,
            html_content=html_content
        )

    async def send_pipeline_failure_alert_email(
        self,
        recipient_email: str,
        recipient_name: str,
        execution_id: str,
        stream_name: str,
        error_message: str,
    ) -> bool:
        """
        Send a pipeline failure alert email to an admin.

        Args:
            recipient_email: Admin's email address
            recipient_name: Admin's display name
            execution_id: ID of the failed execution
            stream_name: Name of the research stream
            error_message: Error message from the failure

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        from datetime import datetime

        base_url = settings.FRONTEND_URL or 'http://localhost:5173'
        execution_url = f"{base_url}/operations/executions/{execution_id}"

        # Truncate long error messages
        truncated_error = error_message[:500] + "..." if len(error_message) > 500 else error_message
        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

        subject = f"Pipeline Failed: {stream_name}"

        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #f97316, #dc2626); color: white; padding: 24px; border-radius: 8px 8px 0 0; }}
        .content {{ background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; }}
        .metadata {{ background: white; padding: 16px; border-radius: 8px; margin: 16px 0; }}
        .metadata-row {{ display: flex; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }}
        .metadata-row:last-child {{ border-bottom: none; }}
        .metadata-label {{ color: #6b7280; width: 120px; }}
        .metadata-value {{ color: #111827; font-weight: 500; }}
        .error-box {{ background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; margin: 16px 0; font-family: monospace; font-size: 13px; color: #991b1b; white-space: pre-wrap; word-break: break-word; }}
        .button {{ display: inline-block; background: #dc2626; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; margin-top: 16px; }}
        .footer {{ text-align: center; padding: 16px; color: #6b7280; font-size: 12px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0; font-size: 20px;">Pipeline Execution Failed</h1>
        </div>
        <div class="content">
            <p>Hi {recipient_name},</p>
            <p>A scheduled pipeline run has failed and may require attention.</p>

            <div class="metadata">
                <div class="metadata-row">
                    <span class="metadata-label">Stream:</span>
                    <span class="metadata-value">{stream_name}</span>
                </div>
                <div class="metadata-row">
                    <span class="metadata-label">Date/Time:</span>
                    <span class="metadata-value">{now_str}</span>
                </div>
            </div>

            <div class="error-box">{truncated_error}</div>

            <a href="{execution_url}" class="button">View Execution Details</a>
        </div>
        <div class="footer">
            {self.app_name} &bull; Research Intelligence Platform
        </div>
    </div>
</body>
</html>
"""

        return await self.send_html_email(
            to_email=recipient_email,
            subject=subject,
            html_content=html_content
        )

    def _log_smtp_error(self, e: Exception) -> None:
        """Log helpful SMTP error messages"""
        if "Application-specific password required" in str(e):
            logger.error("Gmail requires an App Password, not your regular password!")
            logger.error("To fix: Go to Google Account → Security → 2-Step Verification → App passwords")
            logger.error("Generate a 16-character app password and use that in SMTP_PASSWORD")
