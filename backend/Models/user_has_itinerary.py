from Api.database import db
from sqlalchemy import Table, Column, UUID, ForeignKey

user_has_itinerary = Table(
    'user_has_itinerary',
    db.Model.metadata,
    Column('user_id', UUID, ForeignKey('users.id', ondelete='CASCADE')),
    Column('itinerary_id', UUID, ForeignKey('itinerary.id', ondelete='CASCADE')),
    extend_existing=True
)
   