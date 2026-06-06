from fastapi import APIRouter
from app.services.alerts import get_current_alerts

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get("/")
def get_alerts():
    return get_current_alerts()