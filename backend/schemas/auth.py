from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Dict, Any
from datetime import datetime
from models import UserRole

class UserBase(BaseModel):
    email: EmailStr = Field(description="User's email address")

class UserCreate(UserBase):
    password: str = Field(
        min_length=5,
        description="User's password",
        example="securepassword123"
    )

class UserResponse(UserBase):
    user_id: int = Field(description="Unique identifier for the user")
    org_id: Optional[int] = Field(None, description="User's organization ID")
    registration_date: datetime = Field(description="When the user registered")
    role: UserRole = Field(description="User's privilege level")
    full_name: Optional[str] = Field(None, description="User's full name")

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str = Field(description="JWT access token")
    token_type: str = Field(default="bearer", description="Type of token")
    username: str = Field(description="User's username")
    role: UserRole = Field(description="User's privilege level")
    user_id: int = Field(description="User's unique identifier")
    org_id: Optional[int] = Field(None, description="User's organization ID")
    email: str = Field(description="User's email address")

class TokenData(BaseModel):
    email: Optional[str] = Field(None, description="User's email from token")
    user_id: Optional[int] = Field(None, description="User's ID from token")
    org_id: Optional[int] = Field(None, description="User's organization ID")
    username: Optional[str] = Field(None, description="User's username")
    role: Optional[UserRole] = Field(None, description="User's privilege level") 