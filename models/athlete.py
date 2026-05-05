from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from database import Base


class Athlete(Base):
    __tablename__ = "athletes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    intervals_athlete_id = Column(String, unique=True, nullable=False)
    intervals_api_key = Column(String, nullable=False)
    season_start = Column(String, nullable=True)  # YYYY-MM-DD
    created_at = Column(DateTime, default=datetime.utcnow)
