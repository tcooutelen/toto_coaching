from sqlalchemy import Column, Integer, String, DateTime, JSON
from datetime import datetime
from database import Base


class Athlete(Base):
    __tablename__ = "athletes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    intervals_athlete_id = Column(String, unique=True, nullable=False)
    intervals_api_key = Column(String, nullable=False)
    season_start = Column(String, nullable=True)  # YYYY-MM-DD
    effort_durations = Column(JSON, nullable=True)  # list of seconds, e.g. [600, 1080, 2700]
    created_at = Column(DateTime, default=datetime.utcnow)
