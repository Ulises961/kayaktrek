from Api.database import db
from sqlalchemy import Table, Column, UUID, ForeignKey

userHasProfilePicture = Table(
    'user_has_profile_picture',
    db.Model.metadata,
    Column('user_id', UUID, ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
    Column('image_id ', UUID, ForeignKey('image.id', ondelete='CASCADE')),
    extend_existing=True
)

