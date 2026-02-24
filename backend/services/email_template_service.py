"""
Email Template Service

Generates HTML email content from report data.
Structure: Executive summary at top, then each category with its summary followed by articles.

This is a pure template generator - it receives data, no DB access.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
from dataclasses import dataclass

from utils.date_utils import format_pub_date


@dataclass
class EmailArticle:
    """Article data for email template"""
    title: str
    article_id: Optional[int] = None  # For linking to article detail on site
    url: Optional[str] = None
    doi: Optional[str] = None
    pmid: Optional[str] = None
    authors: Optional[List[str]] = None
    journal: Optional[str] = None
    pub_year: Optional[int] = None
    pub_month: Optional[int] = None
    pub_day: Optional[int] = None
    summary: Optional[str] = None


@dataclass
class EmailCategory:
    """Category data for email template"""
    id: str
    name: str
    summary: Optional[str] = None
    articles: List[EmailArticle] = None

    def __post_init__(self):
        if self.articles is None:
            self.articles = []


@dataclass
class EmailReportData:
    """All data needed to generate a report email"""
    report_name: str
    stream_name: str
    report_date: str
    executive_summary: str
    categories: List[EmailCategory]
    uncategorized_articles: List[EmailArticle] = None
    report_url: Optional[str] = None  # Link to view full report on site
    date_range_start: Optional[str] = None  # Start of date range (e.g., "Jan 18, 2026")
    date_range_end: Optional[str] = None  # End of date range (e.g., "Jan 24, 2026")
    # Note: Logo is embedded by EmailService using CID attachment (src="cid:kh_logo")

    def __post_init__(self):
        if self.uncategorized_articles is None:
            self.uncategorized_articles = []


class EmailTemplateService:
    """Generates HTML email content from report data"""

    def generate_report_email(self, data: EmailReportData) -> str:
        """
        Generate HTML email content from report data.

        Args:
            data: EmailReportData containing all report information

        Returns:
            str: Complete HTML email content
        """
        html_parts = [
            self._html_header(data),
            self._view_online_section(data.report_url),
            self._executive_summary_section(data.executive_summary),
        ]

        # Add each category section
        for category in data.categories:
            if category.articles:  # Only include categories with articles
                html_parts.append(
                    self._category_section(category.name, category.summary, category.articles, data.report_url)
                )

        # Add uncategorized if any
        if data.uncategorized_articles:
            html_parts.append(
                self._category_section("Other Articles", "", data.uncategorized_articles, data.report_url)
            )

        html_parts.append(self._html_footer(data.report_url))

        return '\n'.join(html_parts)

    def _html_header(self, data: 'EmailReportData') -> str:
        """Generate HTML header with styles and logo"""
        # Build date range string if available
        date_range_html = ''
        if data.date_range_start and data.date_range_end:
            date_range_html = f'<p class="date-range">Range: {data.date_range_start} – {data.date_range_end}</p>'

        # Logo HTML - use CID reference for email compatibility
        # The actual image will be attached as a MIME part by the email service
        logo_html = '<img src="cid:kh_logo" alt="Knowledge Horizon" class="logo" />'

        return f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{data.report_name}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }}
        .container {{
            background-color: #ffffff;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .header {{
            border-bottom: 2px solid #1e40af;
            padding-bottom: 12px;
            margin-bottom: 16px;
            text-align: center;
        }}
        .header .logo {{
            height: 42px;
            margin-bottom: 8px;
        }}
        .header h1 {{
            color: #1e40af;
            margin: 0 0 4px 0;
            font-size: 22px;
            font-weight: 600;
        }}
        .header .date-range {{
            color: #4b5563;
            font-size: 12px;
            margin: 0 0 2px 0;
        }}
        .header .date {{
            color: #6b7280;
            font-size: 12px;
            margin: 0;
        }}
        .executive-summary {{
            background-color: #f0f9ff;
            border-left: 4px solid #2563eb;
            padding: 20px;
            margin-bottom: 30px;
            border-radius: 0 8px 8px 0;
        }}
        .executive-summary h2 {{
            color: #1e40af;
            margin: 0 0 12px 0;
            font-size: 18px;
        }}
        .executive-summary p {{
            margin: 0;
            color: #374151;
        }}
        .category-section {{
            margin-bottom: 30px;
        }}
        .category-header {{
            background-color: #f3f4f6;
            padding: 15px 20px;
            border-radius: 8px 8px 0 0;
            border-bottom: 1px solid #e5e7eb;
        }}
        .category-header h2 {{
            color: #1f2937;
            margin: 0;
            font-size: 18px;
        }}
        .category-summary {{
            padding: 15px 20px;
            background-color: #fafafa;
            border-left: 1px solid #e5e7eb;
            border-right: 1px solid #e5e7eb;
            font-style: italic;
            color: #4b5563;
        }}
        .articles-list {{
            border: 1px solid #e5e7eb;
            border-top: none;
            border-radius: 0 0 8px 8px;
        }}
        .article {{
            padding: 15px 20px;
            border-bottom: 1px solid #e5e7eb;
        }}
        .article:last-child {{
            border-bottom: none;
        }}
        .article-title {{
            font-weight: 600;
            color: #1f2937;
            margin: 0 0 6px 0;
            font-size: 15px;
        }}
        .article-title a {{
            color: #2563eb;
            text-decoration: none;
        }}
        .article-title a:hover {{
            text-decoration: underline;
        }}
        .article-meta {{
            font-size: 12px;
            color: #6b7280;
            margin-bottom: 8px;
        }}
        .article-summary {{
            font-size: 14px;
            color: #4b5563;
            margin: 0;
        }}
        .footer {{
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #9ca3af;
            font-size: 12px;
        }}
        .footer a {{
            color: #2563eb;
            text-decoration: none;
        }}
        .footer a:hover {{
            text-decoration: underline;
        }}
        .view-online {{
            text-align: center;
            margin-bottom: 16px;
            padding: 10px;
            background-color: #f8fafc;
            border-radius: 6px;
        }}
        .view-online p {{
            margin: 0 0 6px 0;
            color: #64748b;
            font-size: 12px;
        }}
        .view-online a.button {{
            display: inline-block;
            padding: 8px 16px;
            background-color: #2563eb;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 4px;
            font-weight: 500;
            font-size: 13px;
        }}
        .view-online a.button:hover {{
            background-color: #1d4ed8;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            {logo_html}
            <h1>Asbestos and Talc Litigation Science Alert:</h1>
            {date_range_html}
            <p class="date">Generated: {data.report_date}</p>
        </div>'''

    def _view_online_section(self, report_url: Optional[str]) -> str:
        """Generate view online call-to-action section"""
        if not report_url:
            return ''

        return f'''
        <div class="view-online">
            <p>View the full interactive report with additional features</p>
            <a href="{report_url}" class="button">View Full Report Online</a>
        </div>'''

    def _executive_summary_section(self, summary: str) -> str:
        """Generate executive summary section"""
        if not summary:
            return ''

        return f'''
        <div class="executive-summary">
            <h2>Executive Summary</h2>
            <p>{self._format_text(summary)}</p>
        </div>'''

    def _category_section(
        self,
        category_name: str,
        category_summary: Optional[str],
        articles: List[EmailArticle],
        report_url: Optional[str] = None
    ) -> str:
        """Generate a category section with its articles"""
        html = f'''
        <div class="category-section">
            <div class="category-header">
                <h2>{category_name}</h2>
            </div>'''

        if category_summary:
            html += f'''
            <div class="category-summary">
                {self._format_text(category_summary)}
            </div>'''

        html += '''
            <div class="articles-list">'''

        for article in articles:
            html += self._article_item(article, report_url)

        html += '''
            </div>
        </div>'''

        return html

    def _article_item(self, article: EmailArticle, report_url: Optional[str] = None) -> str:
        """Generate HTML for a single article"""
        title = article.title or "Untitled"

        # Build URL - prefer site link if we have article_id and report_url
        url = None
        if article.article_id and report_url:
            # Link to article on site: /reports?stream=X&report=Y&article=Z
            url = f"{report_url}&article={article.article_id}"
        elif article.doi:
            url = f"https://doi.org/{article.doi}"
        elif article.pmid:
            url = f"https://pubmed.ncbi.nlm.nih.gov/{article.pmid}/"

        # Format title with link if we have a URL
        if url:
            title_html = f'<a href="{url}">{self._format_text(title)}</a>'
        else:
            title_html = self._format_text(title)

        # Build meta line
        meta_parts = []
        if article.authors:
            if len(article.authors) <= 3:
                meta_parts.append(', '.join(article.authors))
            else:
                meta_parts.append(f"{article.authors[0]} et al.")
        if article.journal:
            meta_parts.append(article.journal)
        date_str = format_pub_date(article.pub_year, article.pub_month, article.pub_day)
        if date_str:
            meta_parts.append(date_str)

        meta_html = ' &bull; '.join(meta_parts) if meta_parts else ''

        # Get summary (include full summary, no truncation)
        summary = article.summary or ''

        return f'''
                <div class="article">
                    <p class="article-title">{title_html}</p>
                    <p class="article-meta">{meta_html}</p>
                    <p class="article-summary">{self._format_text(summary)}</p>
                </div>'''

    def _html_footer(self, report_url: Optional[str] = None) -> str:
        """Generate HTML footer"""
        link_html = ''
        if report_url:
            link_html = f'<p><a href="{report_url}">View this report online</a></p>'

        return f'''
        <div class="footer">
            {link_html}
            <p>Generated by Knowledge Horizon on {datetime.utcnow().strftime('%B %d, %Y at %H:%M UTC')}</p>
        </div>
    </div>
</body>
</html>'''

    def _format_text(self, text: str) -> str:
        """Format text for HTML display - escape HTML and convert newlines"""
        if not text:
            return ''
        # Escape HTML special characters
        text = text.replace('&', '&amp;')
        text = text.replace('<', '&lt;')
        text = text.replace('>', '&gt;')
        # Convert newlines to <br> tags
        text = text.replace('\n', '<br>')
        return text
