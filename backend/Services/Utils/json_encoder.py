import json
from typing import Any
from uuid import UUID
from datetime import datetime
from flask.json.provider import DefaultJSONProvider

class CustomJSONEncoder(json.JSONEncoder):
    def default(self, o: Any) -> Any:
        if isinstance(o, UUID):
            return str(o)
        if isinstance(o, datetime):
            return o.isoformat()
        return super().default(o)

class CustomJSONProvider(DefaultJSONProvider):
    def dumps(self, obj: Any, **kwargs: Any) -> str:
        return json.dumps(obj, cls=CustomJSONEncoder, **kwargs)
    
    def loads(self, s: str | bytes, **kwargs: Any) -> Any:
        return json.loads(s, **kwargs)