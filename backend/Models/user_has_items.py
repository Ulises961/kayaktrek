from Api.database import db
from sqlalchemy import Table, Column, UUID, ForeignKey

user_has_items = Table(
    'user_has_items',
    db.Model.metadata,
    Column('user_id', UUID, ForeignKey('users.id', ondelete='CASCADE')),
    Column('item_id', UUID, ForeignKey('item.id', ondelete='CASCADE')),
    extend_existing=True
)
   