"""
Reports API endpoints
"""

import logging
import time
import base64
from dataclasses import asdict
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from models import User
from schemas.report import Report, ReportWithArticles
from services.report_service import ReportService, get_report_service
from services.report_article_association_service import (
    ReportArticleAssociationService,
    get_association_service
)
from services.email_service import EmailService
from services.user_tracking_service import track_endpoint
from routers.auth import get_current_user

logger = logging.getLogger(__name__)


# --- Request/Response Schemas ---

class UpdateArticleEnrichmentsRequest(BaseModel):
    ai_enrichments: Dict[str, Any]


class SendReportEmailRequest(BaseModel):
    """Request to send report email"""
    recipients: List[str]


class StoreReportEmailRequest(BaseModel):
    """Request to store report email HTML"""
    html: str


class SendReportEmailResponse(BaseModel):
    """Response from sending report email"""
    success: List[str]
    failed: List[str]


class EmailPreviewResponse(BaseModel):
    """Response containing email HTML preview"""
    html: str
    report_name: str


def _load_logo_images() -> Optional[Dict[str, bytes]]:
    """Load the KH logo image for embedding in previews."""
    import os
    try:
        logo_path = os.path.join(
            os.path.dirname(__file__), '..', '..',
            'frontend', 'public', 'logos', 'KH logo black.png'
        )
        logo_path = os.path.normpath(logo_path)
        if os.path.exists(logo_path):
            with open(logo_path, 'rb') as f:
                return {'kh_logo': f.read()}
    except Exception:
        pass
    return None


def _make_preview_html(html: str, images: Optional[Dict[str, bytes]] = None) -> str:
    """Replace CID image references with inline data URIs for browser preview.

    Email HTML uses cid: references (resolved by email clients via MIME attachments).
    Browsers can't resolve cid: URIs, so we inline them as base64 data URIs.
    """
    if not images:
        images = _load_logo_images()
    if not images:
        return html
    preview = html
    for cid, image_bytes in images.items():
        b64 = base64.b64encode(image_bytes).decode('ascii')
        preview = preview.replace(f'cid:{cid}', f'data:image/png;base64,{b64}')
    return preview


class UpdateSuccessResponse(BaseModel):
    """Response for successful update operations"""
    status: str
    notes: Optional[str] = None
    ai_enrichments: Optional[Dict[str, Any]] = None


router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/recent", response_model=List[Report])
async def get_recent_reports(
    limit: int = 5,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """Get recent reports across all streams for the current user (async)"""
    t_start = time.perf_counter()
    logger.info(f"get_recent_reports - user_id={current_user.user_id}, limit={limit}")

    try:
        results = await service.get_recent_reports(current_user, limit)
        t_query = time.perf_counter()

        # Convert model + article_count + coverage dates to schema
        reports = []
        for r in results:
            validated = Report.model_validate(r.report, from_attributes=True)
            updated = validated.model_copy(
                update={
                    'article_count': r.article_count,
                    'coverage_start_date': r.coverage_start_date,
                    'coverage_end_date': r.coverage_end_date,
                }
            )
            reports.append(updated)
        t_serialize = time.perf_counter()

        logger.info(
            f"get_recent_reports complete - user_id={current_user.user_id}, count={len(reports)}, "
            f"query={t_query - t_start:.3f}s, serialize={t_serialize - t_query:.3f}s, "
            f"total={t_serialize - t_start:.3f}s"
        )
        return reports

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_recent_reports failed - user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get recent reports: {str(e)}"
        )


@router.get("/stream/{stream_id}", response_model=List[Report])
async def get_reports_for_stream(
    stream_id: int,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """Get all reports for a research stream (async)"""
    logger.info(f"get_reports_for_stream - user_id={current_user.user_id}, stream_id={stream_id}")

    try:
        results = await service.get_reports_for_stream(current_user, stream_id)

        # Convert model + article_count to schema
        reports = [
            Report.model_validate(r.report, from_attributes=True).model_copy(
                update={'article_count': r.article_count}
            )
            for r in results
        ]

        logger.info(f"get_reports_for_stream complete - user_id={current_user.user_id}, stream_id={stream_id}, count={len(reports)}")
        return reports

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_reports_for_stream failed - user_id={current_user.user_id}, stream_id={stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get reports: {str(e)}"
        )


@router.get("/{report_id}", response_model=ReportWithArticles)
@track_endpoint("view_report")
async def get_report_with_articles(
    report_id: int,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """Get a report with its associated articles (async)"""
    logger.info(f"get_report_with_articles - user_id={current_user.user_id}, report_id={report_id}")

    try:
        from schemas.report import ReportArticle as ReportArticleSchema

        result = await service.get_report_with_articles(current_user.user_id, report_id)

        if not result:
            logger.warning(f"get_report_with_articles - not found - user_id={current_user.user_id}, report_id={report_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        # Convert model to schema - retrieval_params now comes from the service
        report_schema = Report.model_validate(result.report, from_attributes=True).model_copy(
            update={
                'article_count': result.article_count,
                'retrieval_params': result.retrieval_params or {},
            }
        )

        # Convert articles with association metadata
        articles = [
            ReportArticleSchema(
                article_id=info.article.article_id,
                title=info.article.title,
                authors=info.article.authors or [],
                journal=info.article.journal,
                pmid=info.article.pmid,
                doi=info.article.doi,
                abstract=info.article.abstract,
                url=info.article.url,
                pub_year=info.article.pub_year,
                pub_month=info.article.pub_month,
                pub_day=info.article.pub_day,
                relevance_score=info.association.relevance_score,
                relevance_rationale=info.association.relevance_rationale,
                ranking=info.association.ranking,
                is_starred=info.is_starred,
                is_read=info.association.is_read,
                notes=info.association.notes,
                presentation_categories=info.association.presentation_categories or [],
                ai_summary=info.association.ai_summary,
                ai_enrichments=info.association.ai_enrichments,
            )
            for info in result.articles
        ]

        # Build response with articles
        response = ReportWithArticles(
            **report_schema.model_dump(),
            articles=articles
        )

        logger.info(f"get_report_with_articles complete - user_id={current_user.user_id}, report_id={report_id}")
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_report_with_articles failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get report: {str(e)}"
        )


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    report_id: int,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """Delete a report (async)"""
    logger.info(f"delete_report - user_id={current_user.user_id}, report_id={report_id}")

    try:
        deleted = await service.delete_report(current_user, report_id)

        if not deleted:
            logger.warning(f"delete_report - not found - user_id={current_user.user_id}, report_id={report_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        logger.info(f"delete_report complete - user_id={current_user.user_id}, report_id={report_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete_report failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete report: {str(e)}"
        )


@router.patch("/{report_id}/articles/{article_id}/enrichments", response_model=UpdateSuccessResponse)
async def update_article_enrichments(
    report_id: int,
    article_id: int,
    request: UpdateArticleEnrichmentsRequest,
    report_service: ReportService = Depends(get_report_service),
    association_service: ReportArticleAssociationService = Depends(get_association_service),
    current_user: User = Depends(get_current_user)
):
    """Update AI enrichments for an article within a report (async)"""
    logger.info(f"update_article_enrichments - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")

    try:
        # Access check (raises 404 if not found or no access)
        await report_service.get_report_with_access(report_id, current_user.user_id)

        # Update via association service
        assoc = await association_service.update_enrichments(
            report_id, article_id, request.ai_enrichments
        )

        if not assoc:
            logger.warning(f"update_article_enrichments - article not found - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Article not found in report"
            )

        logger.info(f"update_article_enrichments complete - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")
        return UpdateSuccessResponse(
            status="ok",
            ai_enrichments=request.ai_enrichments
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_article_enrichments failed - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update article enrichments: {str(e)}"
        )


# ============================================================================
# REPORT EMAIL ENDPOINTS
# ============================================================================

@router.post("/{report_id}/email/generate", response_model=EmailPreviewResponse)
async def generate_report_email(
    report_id: int,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Generate email HTML for a report (does not store) - async.
    Use POST /email/store to save the HTML after reviewing.
    """
    logger.info(f"generate_report_email - user_id={current_user.user_id}, report_id={report_id}")

    try:
        # Generate email HTML (no storage)
        result = await service.generate_report_email_html(current_user, report_id)

        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        logger.info(f"generate_report_email complete - user_id={current_user.user_id}, report_id={report_id}")
        preview_html = _make_preview_html(result.html, result.images)
        return EmailPreviewResponse(html=preview_html, report_name=result.report_name)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"generate_report_email failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate email: {str(e)}"
        )


@router.post("/{report_id}/email/store", response_model=EmailPreviewResponse)
async def store_report_email(
    report_id: int,
    request: StoreReportEmailRequest,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Store email HTML for a report (async).
    """
    logger.info(f"store_report_email - user_id={current_user.user_id}, report_id={report_id}")

    try:
        # Store the email HTML
        result = await service.store_report_email_html(current_user, report_id, request.html)

        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        logger.info(f"store_report_email complete - user_id={current_user.user_id}, report_id={report_id}")
        preview_html = _make_preview_html(result.html, result.images)
        return EmailPreviewResponse(html=preview_html, report_name=result.report_name)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"store_report_email failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to store email: {str(e)}"
        )


@router.get("/{report_id}/email", response_model=EmailPreviewResponse)
async def get_report_email(
    report_id: int,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Get stored email HTML for a report (async).
    Returns 404 if email hasn't been generated yet.
    """
    logger.info(f"get_report_email - user_id={current_user.user_id}, report_id={report_id}")

    try:
        # Get stored email HTML
        result = await service.get_report_email_html(current_user, report_id)

        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        if not result.html:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Email not generated yet. Use POST /email/generate first."
            )

        logger.info(f"get_report_email complete - user_id={current_user.user_id}, report_id={report_id}")
        preview_html = _make_preview_html(result.html)
        return EmailPreviewResponse(html=preview_html, report_name=result.report_name)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_report_email failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get email: {str(e)}"
        )


@router.post("/{report_id}/email/send", response_model=SendReportEmailResponse)
async def send_report_email(
    report_id: int,
    request: SendReportEmailRequest,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Send report email to specified recipients (async).
    Generates the email HTML on-the-fly if not already stored.
    """
    logger.info(f"send_report_email - user_id={current_user.user_id}, report_id={report_id}, recipients={request.recipients}")

    try:
        # Always generate email HTML to get proper subject and from_name
        result = await service.generate_report_email_html(current_user, report_id)

        if not result or not result.html:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Could not generate email for this report."
            )

        # Send emails
        email_service = EmailService()
        results = await email_service.send_bulk_report_emails(
            recipients=request.recipients,
            report_name=result.report_name,
            html_content=result.html,
            subject=result.subject,
            from_name=result.from_name,
            images=result.images
        )

        logger.info(f"send_report_email complete - user_id={current_user.user_id}, report_id={report_id}, success={len(results['success'])}, failed={len(results['failed'])}")
        return SendReportEmailResponse(**results)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"send_report_email failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send report email: {str(e)}"
        )
