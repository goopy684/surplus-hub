from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.db.base import Base

class MaterialImage(Base):
    __tablename__ = "material_images"

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"))
    url = Column(String, nullable=False)
    display_order = Column(Integer, default=0)

    material = relationship("Material", back_populates="material_images")

    # Show the image URL (not the object repr) in sqladmin relationship columns.
    def __str__(self) -> str:
        return self.url or f"MaterialImage #{self.id}"
