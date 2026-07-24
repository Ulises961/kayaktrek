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
    # Filters attached to a Logger only run for records that Logger itself originates —
    # they're skipped for child loggers (Resources.*, Services.*, botocore.*, ...) walking up
    # the hierarchy, which is every real application log call. Attach to each Handler instead,
    # so it runs for every record that reaches it regardless of which logger emitted it.
    context_filter = RequestContextFilter()

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.handlers.clear()

    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    console_handler.setFormatter(formatter)
    console_handler.addFilter(context_filter)
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
        file_handler.addFilter(context_filter)
        root_logger.addHandler(file_handler)

    logging.getLogger("werkzeug").setLevel(
        logging.INFO if app.config.get("DEBUG") else logging.WARNING
    )
    # SQLAlchemy is noisy at INFO (every query). Keep at WARNING unless
    # SQL_ECHO=true is explicitly set in the environment for a debug session.
    sql_level = logging.DEBUG if os.getenv("SQL_ECHO") == "true" else logging.WARNING
    logging.getLogger("sqlalchemy.engine").setLevel(sql_level)
    logging.getLogger("sqlalchemy.pool").setLevel(sql_level)
    logging.getLogger("sqlalchemy.dialects").setLevel(sql_level)
