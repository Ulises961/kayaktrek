import logging
from logging.handlers import RotatingFileHandler
import os

from Services.Utils.logging_utils import JsonFormatter, RequestContextFilter


def setup_logging(app) -> None:
    if app.config.get("DEBUG"):
        log_level = logging.DEBUG
    elif app.config.get("TESTING"):
        log_level = logging.WARNING
    else:
        log_level = logging.WARNING

    formatter = JsonFormatter(datefmt="%Y-%m-%dT%H:%M:%S")

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.handlers.clear()
    root_logger.addFilter(RequestContextFilter())

    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    log_dir = os.getenv("LOG_DIR")
    if log_dir:
        os.makedirs(log_dir, exist_ok=True)
        file_handler = RotatingFileHandler(
            os.path.join(log_dir, "kayak-trip-planner.log"),
            maxBytes=2_000_000,
            backupCount=5,
            encoding="UTF-8",
        )
        file_handler.setLevel(log_level)
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)

    logging.getLogger("werkzeug").setLevel(
        logging.INFO if app.config.get("DEBUG") else logging.WARNING
    )
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if app.config.get("DEBUG") else logging.WARNING
    )
