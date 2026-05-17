from fastapi import FastAPI

from app.db.database import Base, engine
from app.db import models
from app.routers import shelters

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.include_router(shelters.router)


@app.get("/")
def root():
    return {"message": "ShelterNow backend is running"}
