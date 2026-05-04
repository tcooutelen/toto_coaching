from sqlalchemy import Column, String, Integer, JSON, ForeignKey, UniqueConstraint
from database import Base


class Wellness(Base):
    __tablename__ = "wellness"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(String, nullable=False, index=True)
    athlete_id = Column(Integer, ForeignKey("athletes.id"), nullable=False, index=True)
    data = Column(JSON, nullable=False)

    __table_args__ = (UniqueConstraint("date", "athlete_id", name="uq_wellness_date_athlete"),)
