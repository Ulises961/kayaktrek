from gevent import monkey

monkey.patch_all()

from psycogreen.gevent import patch_psycopg

patch_psycopg()

import os
from dotenv import load_dotenv
from Api.app import createApp

load_dotenv()
app = createApp(os.getenv("CONFIG_MODE", "development"))

if __name__ == "__main__":
    app.run(host=os.environ["FLASK_HOST"])
