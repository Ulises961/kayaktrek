from Api.database import db
from sqlalchemy import UUID, Table, Column, ForeignKey

user_endorses_log = Table(
    'user_endorses_log',
    db.Model.metadata,
    Column('log_id', UUID, ForeignKey('log.id', ondelete='CASCADE'), primary_key=True),
    Column('endorsers', UUID, ForeignKey('users.id', ondelete='CASCADE')),
    extend_existing=True
)
