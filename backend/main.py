from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
# from routers import search, auth, workflow, tools, files, bot, asset
# Import only Knowledge Horizon compatible routers (legacy routers removed)
from routers import auth, llm, search, web_retrieval, pubmed, extraction, unified_search, lab, research_streams, reports, chat_stream, tools, retrieval_testing, prompt_testing, document_analysis, articles, tablizer
# User and multi-tenancy routers
from routers import user, organization, subscriptions, admin, notes, operations, curation, help, starring
# Tracking and chat persistence routers
from routers import tracking, chat
from database import init_db
from config import settings, setup_logging
from middleware import LoggingMiddleware
from pydantic import ValidationError
from fastapi.exceptions import RequestValidationError
from starlette.responses import JSONResponse

# Setup logging first
logger, request_id_filter = setup_logging()

logger.info(f"Database target: {settings.DB_NAME} @ {settings.DB_HOST}")

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.SETTING_VERSION,
    swagger_ui_parameters={
        "persistAuthorization": True,
        "displayRequestDuration": True,
        "tryItOutEnabled": True,
        "defaultModelsExpandDepth": -1,
    }
)

# Add logging middleware
app.add_middleware(LoggingMiddleware, request_id_filter=request_id_filter)

# CORS configuration - include X-New-Token in exposed headers for token refresh
cors_expose_headers = list(settings.CORS_EXPOSE_HEADERS) + ["X-New-Token"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=settings.CORS_ALLOW_METHODS,
    allow_headers=settings.CORS_ALLOW_HEADERS,
    expose_headers=cors_expose_headers,
)


@app.middleware("http")
async def token_refresh_middleware(request: Request, call_next):
    """
    Middleware to inject refreshed token into response header.

    If validate_token() determines the token needs refresh, it stores
    the new token in request.state.new_token. This middleware reads it
    and adds it to the response header so the frontend can update its stored token.
    """
    response = await call_next(request)

    # Check if a new token was generated during validation
    if hasattr(request.state, 'new_token') and request.state.new_token:
        response.headers["X-New-Token"] = request.state.new_token

    return response

# Include routers
logger.info("Including routers...")

# Auth router with custom prefix
app.include_router(
    auth.router,
    prefix="/api/auth",
    tags=["auth"],
    responses={401: {"description": "Not authenticated"}}
)

# Core API routers (prefix added here)
# Chat router removed - Knowledge Horizon uses different chat approach
# User session router removed - Knowledge Horizon uses simplified auth
app.include_router(llm.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(web_retrieval.router, prefix="/api")
app.include_router(pubmed.router, prefix="/api")
# Google Scholar removed - legacy feature with EventType dependency
app.include_router(extraction.router, prefix="/api")
app.include_router(unified_search.router, prefix="/api")
app.include_router(lab.router, prefix="/api")
app.include_router(research_streams.router)
app.include_router(reports.router)
app.include_router(chat_stream.router)
app.include_router(tools.router)
app.include_router(tablizer.router)
app.include_router(retrieval_testing.router)
app.include_router(prompt_testing.router)
app.include_router(document_analysis.router)
app.include_router(articles.router)
# Smart Search 2 removed - legacy feature with EventType dependency

# User and multi-tenancy routers
app.include_router(user.router)
app.include_router(organization.router)
app.include_router(subscriptions.router)
app.include_router(admin.router)
app.include_router(help.router)
app.include_router(notes.router)
app.include_router(operations.router)
app.include_router(curation.router)
app.include_router(starring.router)

# Tracking and chat persistence routers
app.include_router(tracking.router)
app.include_router(chat.router)

# Legacy routers removed for Knowledge Horizon transition:
# - workbench: Uses legacy Asset/Mission models
# - article_chat: Uses UserCompanyProfile
# - pubmed_search_designer: Uses legacy models
# - analytics: Uses EventType/UserEvent models

logger.info("Routers included")


@app.on_event("startup")
async def startup_event():
    logger.info("Application starting up...")
    init_db()
    logger.info("Database initialized")
    #logger.info(f"Settings object: {settings}")
    #logger.info(f"ACCESS_TOKEN_EXPIRE_MINUTES value: {settings.ACCESS_TOKEN_EXPIRE_MINUTES}")


@app.get("/")
async def root():
    """Root endpoint - redirects to API health check"""
    return {"message": "JamBot API", "health": "/api/health", "docs": "/docs"}

@app.get("/api/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {"status": "healthy", "version": settings.SETTING_VERSION}


@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError):
    logger.error(f"Pydantic ValidationError in {request.url.path}:")
    for error in exc.errors():
        logger.error(f"  - {error['loc']}: {error['msg']} (type: {error['type']})")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()}
    )


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle FastAPI request validation errors (body parsing, query params, etc.)"""
    logger.error(f"RequestValidationError in {request.url.path}:")
    for error in exc.errors():
        logger.error(f"  - {error.get('loc')}: {error.get('msg')} (type: {error.get('type')})")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()}
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all handler for any unhandled exceptions"""
    logger.exception(f"Unhandled exception in {request.url.path}: {type(exc).__name__}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {type(exc).__name__}"}
    )


logger.info("Application startup complete")