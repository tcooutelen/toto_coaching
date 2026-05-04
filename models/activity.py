from sqlalchemy import Column, String, Integer, Boolean, JSON, ForeignKey
from database import Base


class Activity(Base):
    __tablename__ = "activities"

    id = Column(String, primary_key=True)
    athlete_id = Column(Integer, ForeignKey("athletes.id"), nullable=False, index=True)
    start_date_local = Column(String, index=True)
    has_detail = Column(Boolean, default=False, nullable=False)
    data = Column(JSON, nullable=False)
