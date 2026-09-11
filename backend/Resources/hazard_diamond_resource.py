from http import HTTPStatus
import logging

from flask import Blueprint, jsonify, request, abort
from werkzeug.exceptions import HTTPException

from Schemas.hazard_diamond_schema import HazardDiamondPositionSchema
from Services.Middleware.auth_middleware import JWTService
from Services.hazard_diamond_service import HazardDiamondService

logger = logging.getLogger(__name__)

# Position-only cross-trip view of tidal and wind diamonds (M27). The only
# resource allowed to know about both diamond types, so the two CRUD
# resources (tidal_diamond, wind_diamond) stay independent of each other.
hazard_diamond_api = Blueprint('hazard_diamond', __name__, url_prefix='/api/v1/hazard-diamond')

_position_schema = HazardDiamondPositionSchema(many=True)


@hazard_diamond_api.route('/nearby', methods=['GET'])
@JWTService.authenticate_restful
def get_nearby_hazard_diamonds():
    """
    ---
    get:
      summary: Find known hazard-diamond positions near a point
      description: >
        Position only, ever — an unlabeled pin ("something is known here"),
        never the diamond's content (name/notes/rate/direction). See
        docs/adr/features.md "Revision (M27): position-only diamond sharing".
      parameters:
        - in: query
          name: lat
          required: true
          schema:
            type: number
        - in: query
          name: lng
          required: true
          schema:
            type: number
        - in: query
          name: range
          required: false
          schema:
            type: number
            default: 5.0
          description: Search radius in kilometres, between 0 and 100
      responses:
        200:
          description: Hazard-diamond positions within range
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/HazardDiamondPositionSchema'
        400:
          description: Missing or out-of-range lat/lng/range
    """
    try:
        lat = request.args.get('lat', type=float)
        lng = request.args.get('lng', type=float)
        range_km = request.args.get('range', default=5.0, type=float)

        if lat is None or lng is None:
            abort(HTTPStatus.BAD_REQUEST, description="lat and lng query parameters are required")
        if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
            abort(HTTPStatus.BAD_REQUEST, description="lat/lng out of range")
        if range_km <= 0 or range_km > 100:
            abort(HTTPStatus.BAD_REQUEST, description="range must be between 0 and 100 km")

        positions = HazardDiamondService.get_nearby_positions(lat, lng, range_km)
        return jsonify(_position_schema.dump(positions)), HTTPStatus.OK
    except HTTPException:
        raise
    except Exception as e:
        logger.error("get_nearby_hazard_diamonds_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
