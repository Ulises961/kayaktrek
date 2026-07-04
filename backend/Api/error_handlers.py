"""
Centralized error handlers for the application.
Register these handlers in the app factory.
"""
from flask import jsonify
from flask_limiter.errors import RateLimitExceeded
from sqlalchemy.exc import IntegrityError, SQLAlchemyError, NoResultFound
from marshmallow import ValidationError
from werkzeug.exceptions import HTTPException
import logging

from Api.database import db

logger = logging.getLogger(__name__)


def register_error_handlers(app):
    """
    Register all error handlers with the Flask application.

    Args:
        app: Flask application instance
    """

    @app.errorhandler(NoResultFound)
    def handle_no_result_found(error):
        """Handle database query with no results."""
        logger.warning(f"Resource not found: {str(error)}")
        return jsonify({
            "error": "Not Found",
            "message": "The requested resource does not exist"
        }), 404

    @app.errorhandler(IntegrityError)
    def handle_integrity_error(error):
        """Handle database integrity constraint violations."""
        db.session.rollback()
        logger.error(f"Database integrity error: {str(error)}")
        return jsonify({
            "error": "Integrity Error",
            "message": "Database constraint violation. This may be due to duplicate or invalid data.",
        }), 400

    @app.errorhandler(ValidationError)
    def handle_validation_error(error):
        """Handle Marshmallow schema validation errors."""
        logger.warning(f"Validation error: {error.messages}")
        return jsonify({
            "error": "Validation Error",
            "message": "Invalid input data",
            "errors": error.messages
        }), 422

    @app.errorhandler(SQLAlchemyError)
    def handle_sqlalchemy_error(error):
        """Handle general SQLAlchemy database errors."""
        db.session.rollback()
        logger.error(f"Database error: {str(error)}")
        return jsonify({
            "error": "Database Error",
            "message": "An error occurred while accessing the database"
        }), 500

    @app.errorhandler(ValueError)
    def handle_value_error(error):
        """Handle ValueError exceptions."""
        logger.warning(f"Value error: {str(error)}")
        return jsonify({
            "error": "Invalid Value",
            "message": "Invalid or missing request data"
        }), 400

    @app.errorhandler(KeyError)
    def handle_key_error(error):
        """Handle missing required fields. The key name is logged (useful for debugging)
        but not echoed to the client — same posture as the ValueError handler, and this
        one can fire from internal config/env-var lookups, not just request payloads."""
        logger.warning(f"Missing key: {str(error)}")
        return jsonify({
            "error": "Missing Field",
            "message": "A required field is missing from the request"
        }), 400

    @app.errorhandler(RateLimitExceeded)
    def handle_rate_limit(error):
        """Handle rate limit breaches — always includes Retry-After."""
        logger.info(f"HTTP exception: 429 - {error.description}")
        response = jsonify({"error": "Too Many Requests", "message": error.description})
        response.status_code = 429
        response.headers["Retry-After"] = "60"
        return response

    @app.errorhandler(HTTPException)
    def handle_http_exception(error):
        """Handle Flask/Werkzeug HTTP exceptions."""
        logger.info(f"HTTP exception: {error.code} - {error.description}")
        return jsonify({
            "error": error.name,
            "message": error.description
        }), error.code

    @app.errorhandler(404)
    def handle_404(error):
        """Handle 404 Not Found errors."""
        return jsonify({
            "error": "Not Found",
            "message": "The requested endpoint does not exist"
        }), 404

    @app.errorhandler(405)
    def handle_405(error):
        """Handle 405 Method Not Allowed errors."""
        return jsonify({
            "error": "Method Not Allowed",
            "message": "The HTTP method is not allowed for this endpoint"
        }), 405

    @app.errorhandler(500)
    def handle_500(error):
        """Handle 500 Internal Server Error."""
        logger.error(f"Internal server error: {str(error)}")
        return jsonify({
            "error": "Internal Server Error",
            "message": "An unexpected error occurred"
        }), 500

    @app.errorhandler(Exception)
    def handle_unexpected_error(error):
        """Catch-all handler for unexpected errors."""
        db.session.rollback()
        logger.exception(f"Unexpected error: {str(error)}")
        return jsonify({
            "error": "Internal Server Error",
            "message": "An unexpected error occurred"
        }), 500
