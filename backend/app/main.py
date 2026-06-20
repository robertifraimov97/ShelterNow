from fastapi import FastAPI

from app.db.database import Base, engine
from app.db import models
from app.routers import shelters, submitted_shelters, followed_areas, recommendations, routing, alerts, community_shelters, push

# Create all database tables based on the SQLAlchemy models
# if they do not already exist.
Base.metadata.create_all(bind=engine)

# Create the main FastAPI application instance.
app = FastAPI()

# Register all route groups used by the backend.
app.include_router(shelters.router)
app.include_router(submitted_shelters.router)
app.include_router(followed_areas.router)
app.include_router(recommendations.router)
app.include_router(routing.router)
app.include_router(alerts.router)
app.include_router(community_shelters.router)
app.include_router(push.router)


# Simple root endpoint used to verify that the backend is running.
@app.get("/")
def root():
    return {"message": "ShelterNow backend is running"}
