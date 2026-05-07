from sqlalchemy import Column, String, JSON
from database import Base


class Config(Base):
    __tablename__ = "config"

    key = Column(String, primary_key=True)
    value = Column(JSON, nullable=False)
