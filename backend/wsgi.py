import os
from dotenv import load_dotenv
from Api.app import createApp

load_dotenv()
app = createApp(os.getenv("CONFIG_MODE", "development"))

if __name__ == "__main__":
    app.run(host=os.environ["FLASK_HOST"])
