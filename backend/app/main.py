from fastapi import FastAPI

from app.db.database import Base, engine
from app.db import models
from app.routers import shelters, submitted_shelters, followed_areas, recommendations, routing, alerts, community_shelters, push

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.include_router(shelters.router)
app.include_router(submitted_shelters.router)
app.include_router(followed_areas.router)
app.include_router(recommendations.router)
app.include_router(routing.router)
app.include_router(alerts.router)
app.include_router(community_shelters.router)
app.include_router(push.router)


@app.get("/")
def root():
    return {"message": "ShelterNow backend is running"}
