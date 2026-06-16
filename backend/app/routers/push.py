from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import PushToken
from app.schemas.push_token import (
    PushTokenCreate,
    PushTokenResponse,
)

router = APIRouter(prefix="/push", tags=["Push Notifications"])


@router.post("/register", response_model=PushTokenResponse)
def register_push_token(
    push_token: PushTokenCreate,
    db: Session = Depends(get_db),
):
    existing_token = (
        db.query(PushToken)
        .filter(PushToken.token == push_token.token)
        .first()
    )

    if existing_token:
        return existing_token

    new_token = PushToken(
        token=push_token.token,
        platform=push_token.platform,
    )

    db.add(new_token)
    db.commit()
    db.refresh(new_token)

    return new_token