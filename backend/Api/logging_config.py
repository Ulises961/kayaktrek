"""
Logging configuration for the application.
Centralizes logging setup for consistency across the application.
"""
import logging
from logging.handlers import RotatingFileHandler
import os


def setup_logging(app):
    """
    Configure application-wide logging.
    
    Sets up:
    - Rotating file handler with size limits
    - Console handler for development
    - Proper formatting
    - Log level based on environment
    
    Args:
        app: Flask application instance
    """
    # Determine log level based on environment
    if app.config.get('DEBUG'):
        log_level = logging.DEBUG
    elif app.config.get('TESTING'):
        log_level = logging.INFO
    else:
        log_level = logging.WARNING
    
    log_format = "%(asctime)s %(name)-12s %(levelname)-8s %(message)s"
    date_format = "%m-%d %H:%M"
    formatter = logging.Formatter(log_format, datefmt=date_format)

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.handlers.clear()

    # Always log to stdout — Docker captures this; log drivers (Loki, CloudWatch) pick it up.
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # Optional rotating file handler — only when LOG_DIR is explicitly set.
    # In containers leave LOG_DIR unset; mount a volume and set it only if local file
    # logs are needed alongside stdout.
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
    if app.config.get("DEBUG"):
        logging.getLogger("sqlalchemy.engine").setLevel(logging.INFO)
    else:
        logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    app.logger.info(f"Logging configured at level {log_level}")
