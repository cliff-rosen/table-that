"""
Auth Service - Authentication and token management.

This service owns:
- JWT token creation and validation
- Password hashing utilities
- Login/logout flows

User CRUD operations are handled by user_service.
"""

from datetime import datetime, timedelta
from typing import Optional, TypedDict
from jose import JWTError, ExpiredSignatureError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status, Depends, Security, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from models import User
from schemas.user import Token
from services.user_service import UserService
from config.settings import settings
from database import get_async_db
import logging
import time
import traceback

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = settings.JWT_SECRET_KEY
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
# Refresh token when this percentage of lifetime has passed (e.g., 0.8 = 80%)
TOKEN_REFRESH_THRESHOLD = 0.8
logger = logging.getLogger(__name__)

security = HTTPBearer()


class TokenPayload(TypedDict, total=False):
    """Strongly-typed JWT token payload."""
    sub: str          # Subject (email)
    user_id: int      # User ID
    org_id: int       # Organization ID (can be None but typed as int for simplicity)
    username: str     # Display username
    role: str         # User role value
    iat: int          # Issued-at timestamp (added automatically)
    exp: datetime     # Expiration (added automatically)


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: TokenPayload, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token.

    Args:
        data: Token payload data
        expires_delta: Optional custom expiration time

    Returns:
        Encoded JWT token string
    """
    to_encode: dict = dict(data)
    now = datetime.utcnow()

    # Add issued-at time if not already present
    # Use time.time() for consistent UTC timestamp (datetime.utcnow().timestamp() has timezone issues)
    if "iat" not in to_encode:
        to_encode["iat"] = int(time.time())

    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    logger.info(f"Created access token for user_id={data.get('user_id')}")
    return encoded_jwt


def _create_token_for_user(user: User) -> Token:
    """
    Create a Token response for an authenticated user.

    Args:
        user: Authenticated user model

    Returns:
        Token schema with access_token and user info
    """
    username = user.email.split('@')[0]

    token_data = {
        "sub": user.email,
        "user_id": user.user_id,
        "org_id": user.org_id,
        "username": username,
        "role": user.role.value
    }

    access_token = create_access_token(data=token_data)

    return Token(
        access_token=access_token,
        token_type="bearer",
        username=username,
        role=user.role,
        user_id=user.user_id,
        org_id=user.org_id,
        email=user.email
    )


async def login_user(db: AsyncSession, email: str, password: str) -> Token:
    """
    Authenticate user and return JWT token (async).

    Args:
        db: Async database session
        email: User's email
        password: User's password

    Returns:
        Token with JWT and user info

    Raises:
        HTTPException: If credentials invalid or user inactive
    """
    from services.user_service import UserService

    logger.info(f"Login attempt for: {email}")

    user_service = UserService(db)
    user = await user_service.verify_credentials(email, password)

    if not user:
        logger.warning(f"Failed login attempt for: {email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    logger.info(f"Successful login for: {email}")
    return _create_token_for_user(user)


async def register_and_login_user(
    db: AsyncSession,
    email: str,
    password: str,
    invitation_token: Optional[str] = None
) -> Token:
    """
    Register a new user and automatically log them in.

    Args:
        db: Async database session
        email: User's email address
        password: User's password
        invitation_token: Optional invitation token for org assignment

    Returns:
        Token with JWT and user info

    Raises:
        HTTPException: If email already exists or invitation invalid
    """
    from services.user_service import UserService
    from models import Invitation, Organization, UserRole as UserRoleModel
    from schemas.user import UserRole
    from datetime import datetime
    from sqlalchemy import select

    logger.info(f"Registering new user: {email}")

    org_id = None
    role = UserRole.MEMBER

    if invitation_token:
        result = await db.execute(
            select(Invitation).where(
                Invitation.token == invitation_token,
                Invitation.is_revoked == False,
                Invitation.accepted_at == None
            )
        )
        invitation = result.scalars().first()

        if not invitation:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired invitation"
            )

        if invitation.expires_at < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invitation has expired"
            )

        if invitation.email.lower() != email.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email does not match invitation"
            )

        org_id = invitation.org_id
        role = UserRole(invitation.role)

        invitation.accepted_at = datetime.utcnow()
        await db.commit()

        logger.info(f"User {email} registered via invitation to org {org_id}")
    else:
        result = await db.execute(
            select(Organization).where(Organization.name == "Default Organization")
        )
        default_org = result.scalars().first()

        if default_org:
            org_id = default_org.org_id
            logger.info(f"User {email} assigned to default organization (id={org_id})")
        else:
            logger.warning(f"No default organization found for user {email}")

    user_service = UserService(db)
    user = await user_service.create_user(
        email=email,
        password=password,
        role=role,
        org_id=org_id
    )

    logger.info(f"Successfully registered user: {email}")
    return _create_token_for_user(user)


async def validate_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Security(security),
    db: AsyncSession = Depends(get_async_db)
) -> User:
    """
    Validate JWT token and return user.

    This is used as a dependency in routers: Depends(auth_service.validate_token)

    If the token is valid but past the refresh threshold (80% of lifetime),
    a new token is generated and stored in request.state.new_token for
    the middleware to return in the response header.

    Args:
        request: FastAPI request object (for storing refresh token)
        credentials: HTTP Authorization header with Bearer token
        db: Async database session

    Returns:
        Authenticated User model

    Raises:
        HTTPException: If token invalid or user not found
    """
    t_start = time.perf_counter()
    try:
        logger.debug("[AUTH] validate_token called")
        token = credentials.credentials
        logger.debug(f"Validating token: {token[:10]}...")

        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        t_jwt = time.perf_counter()

        email: str = payload.get("sub")
        username: str = payload.get("username")
        role: str = payload.get("role")
        user_id: int = payload.get("user_id")
        org_id: int = payload.get("org_id")

        if email is None:
            logger.error("Token missing email claim")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload"
            )

        # Get user from database (async)
        user_service = UserService(db)
        user = await user_service.get_user_by_email(email)
        t_user = time.perf_counter()
        if user is None:
            logger.error(f"Token user not found: {email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )

        # Check if user is active
        if not user.is_active:
            logger.warning(f"Inactive user attempted access: {email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account is deactivated"
            )

        # Add username to user object for convenience
        user.username = username

        # Check if role has changed - if so, force a token refresh with new role
        role_changed = role and user.role.value != role
        if role_changed:
            logger.info(f"Role changed for {email}: token={role}, db={user.role.value} - will refresh token")

        # Check if token needs refresh (past threshold of lifetime)
        exp_timestamp = payload.get('exp')
        iat_timestamp = payload.get('iat')  # issued-at time

        should_refresh = False
        current_time = int(time.time())

        if exp_timestamp:
            time_until_expiry = exp_timestamp - current_time

            # Calculate token lifetime and how much has been used
            if iat_timestamp:
                total_lifetime = exp_timestamp - iat_timestamp
                time_elapsed = current_time - iat_timestamp
                lifetime_used = time_elapsed / total_lifetime if total_lifetime > 0 else 0

                if lifetime_used >= TOKEN_REFRESH_THRESHOLD:
                    should_refresh = True
            else:
                # No iat claim - use expiry time to estimate
                # If less than 20% of default lifetime remains, refresh
                total_lifetime_seconds = ACCESS_TOKEN_EXPIRE_MINUTES * 60
                threshold_seconds = total_lifetime_seconds * (1 - TOKEN_REFRESH_THRESHOLD)

                if time_until_expiry < threshold_seconds:
                    should_refresh = True

        # Generate new token if refresh needed or role changed
        if should_refresh or role_changed:
            # Use current user data from DB (picks up role changes, org changes, etc.)
            new_token_data = {
                "sub": user.email,
                "user_id": user.user_id,
                "org_id": user.org_id,
                "username": user.email.split('@')[0],
                "role": user.role.value,
                "iat": int(time.time())  # Add issued-at for future refresh calculations
            }
            new_token = create_access_token(data=new_token_data)
            request.state.new_token = new_token
            logger.debug(f"Generated refresh token for {email}")

        t_end = time.perf_counter()
        logger.info(
            f"validate_token - email={email}, jwt={t_jwt - t_start:.3f}s, "
            f"user_lookup={t_user - t_jwt:.3f}s, total={t_end - t_start:.3f}s"
        )
        return user

    except ExpiredSignatureError:
        logger.info("Token expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired"
        )
    except JWTError as e:
        logger.error(f"JWT validation error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token validation error: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token validation failed: {str(e)}"
        )
