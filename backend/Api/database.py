from typing import TYPE_CHECKING

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import MetaData

metadata = MetaData()
db = SQLAlchemy(metadata=metadata)

# `db.Model` (Flask-SQLAlchemy) is the real runtime base — it provides automatic
# `__tablename__` generation and the query property. mypy cannot resolve a
# dynamically-created attribute as a base class, so under type checking we alias
# `Base` to a real `DeclarativeBase`. At runtime `Base is db.Model`, so behaviour
# is unchanged; models inherit `Base` and type-check cleanly.
if TYPE_CHECKING:
    from sqlalchemy.orm import DeclarativeBase

    class Base(DeclarativeBase):
        pass
else:
    Base = db.Model
