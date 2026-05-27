import os
from datetime import date
import json
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import NoResultFound
from sqlalchemy.pool import NullPool as _NullPool

from Models.user import User
from Models.item_category import ItemCategory
from Models.trip_member import MemberRoleType
from Schemas.trip_member_schema import TripMemberSchema
from uuid import UUID
from Resources.inventory_resource import INVENTORY_ENDPOINT
from Resources.item_category_resource import ITEM_CATEGORY_ENDPOINT
from Resources.item_resource import ITEM_ENDPOINT
from Resources.itinerary_resource import ITINERARY_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT
from Services.Middleware.auth_middleware import JWTService
from Api.app import createApp
from Api.database import db as _db
from Api.seed import seed_item_categories


def _get_worker_id(request) -> str:
    """Return the pytest-xdist worker ID, or 'master' for single-process runs."""
    if hasattr(request.config, 'workerinput'):
        return request.config.workerinput['workerid']
    return 'master'


@pytest.fixture(scope='session')
def app(request):
    """Session-wide test Flask application, isolated to its own PostgreSQL schema."""
    worker_id = _get_worker_id(request)
    schema = f"test_{worker_id}"

    # Bootstrap using a plain connection (no custom search_path) so that:
    #   - the PostGIS extension lands in public (accessible to all schemas via search_path)
    #   - the worker schema is created before the app engine (with search_path) is set up
    db_url = os.getenv("TESTING_DATABASE_URL", os.getenv("DATABASE_URL"))
    bootstrap = create_engine(db_url, poolclass=_NullPool)
    with bootstrap.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis SCHEMA public"))
        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
        conn.commit()
    bootstrap.dispose()

    app = createApp('testing', schema=schema)
    ctx = app.app_context()
    ctx.push()
    _db.create_all()
    seed_item_categories()

    def teardown():
        _db.session.remove()
        _db.drop_all()
        cleanup = create_engine(db_url, poolclass=_NullPool)
        with cleanup.connect() as conn:
            conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
            conn.commit()
        cleanup.dispose()
        _db.engine.dispose()
        ctx.pop()

    request.addfinalizer(teardown)
    return app


def _activate_user(mail: str) -> User:
    """Directly activate a test user in the DB (bypasses email flow)."""
    user = User.query.filter_by(mail=mail).first()
    if not user:
        raise NoResultFound(f"User {mail} not found after registration")
    user.active = True
    _db.session.commit()
    return user


@pytest.fixture(scope="session")
def user_1(app):
    client = app.test_client()
    user1 = {
        "mail": "test.user@gmail.com",
        "pwd": "testPassword6$",
        "phone": "+390123456789",
        "name": "Test User",
        "username": "test",
        "admin": True
    }
    response = client.post("/api/auth/register", json=user1)
    assert response.status_code == 201
    return _activate_user("test.user@gmail.com")


@pytest.fixture(scope="session")
def user_2(app):
    client = app.test_client()
    user2 = {
        "mail": "test1.user@gmail.com",
        "pwd": "pwdTest2$",
        "phone": "+391234567899",
        "name": "Don",
        "surname": "charles",
        "username": "charles99"
    }
    response = client.post("/api/auth/register", json=user2)
    assert response.status_code == 201
    return _activate_user("test1.user@gmail.com")

@pytest.fixture(scope='session')
def client(app):
    """Test client for making requests."""
    return app.test_client()

@pytest.fixture(scope='session')
def id(user_1):
    """Create first test user and return their public_id."""
    return str(user_1.id)

@pytest.fixture(scope='session')
def id_2(user_2):
    """Create second test user and return their id."""

    return str(user_2.id)


@pytest.fixture(scope='session')
def auth_token(app, user_1):
    """Get JWT token for the test user."""

    token = JWTService.generate_access_token(user_1.id, user_1.mail, user_1.admin)
    return token

@pytest.fixture(scope='session')
def auth_headers(auth_token):
    """Return authorization headers for authenticated requests."""
    return {'Authorization': f'Bearer {auth_token}'}

@pytest.fixture(scope='session')
def auth_token_2(app, user_2):
    """Get JWT token for the second test user."""
    token = JWTService.generate_access_token(user_2.id, user_2.mail, user_2.admin)
    return token

@pytest.fixture(scope='session')
def auth_headers_2(auth_token_2):
    """Return authorization headers for the second test user."""
    return {'Authorization': f'Bearer {auth_token_2}'}

@pytest.fixture(scope='function')
def outsider_headers(app, client):
    """
    Register a fresh user, yield their auth headers, then delete them.
    Useful for tests that need a guaranteed non-member, independent of session state.
    """
    outsider_data = {
        "mail": "outsider.tmp@example.com",
        "pwd": "Outsider9$",
        "phone": "+39099900002",
        "name": "Outsider",
        "username": "outsider_tmp",
    }
    client.post("/api/auth/register", json=outsider_data)
    with app.app_context():
        outsider = _activate_user("outsider.tmp@example.com")
        token = JWTService.generate_access_token(str(outsider.id), outsider.mail, outsider.admin)
        outsider_id = str(outsider.id)

    yield {"Authorization": f"Bearer {token}"}

    with app.app_context():
        user = _db.session.query(User).filter_by(id=UUID(outsider_id)).first()
        if user:
            _db.session.delete(user)
            _db.session.commit()

@pytest.fixture(scope="session")
def category_ids(app):
    """Return a slug→id mapping for all seeded item categories.

    The app fixture already pushed an application context, so we query directly
    without creating a nested context (which would open a separate session).
    """
    rows = _db.session.query(ItemCategory.slug, ItemCategory.id).all()
    return {slug: str(cat_id) for slug, cat_id in rows}


@pytest.fixture(scope="function")
def inventory_with_items(client, auth_headers, id, category_ids):
    """Create a personal inventory with two items for testing.

    Yields a dict:
        {
            "inventory": <inventory response dict>,
            "items": [<item1 response dict>, <item2 response dict>],
        }
    """
    inv_response = client.post(f"{INVENTORY_ENDPOINT}/create", headers=auth_headers, json={})
    assert inv_response.status_code == 201
    inv_data = json.loads(inv_response.data)
    inventory_id = inv_data['id']

    items = []
    for payload in [
        {"inventoryId": inventory_id, "categoryId": category_ids["travel"], "name": "compass"},
        {"inventoryId": inventory_id, "categoryId": category_ids["first_aid"], "name": "scissors"},
    ]:
        r = client.post(f"{ITEM_ENDPOINT}/create", headers=auth_headers, json=payload)
        assert r.status_code == 201
        items.append(json.loads(r.data))

    yield {"inventory": inv_data, "items": items}

    for item in items:
        try:
            client.delete(f"{ITEM_ENDPOINT}/{item['id']}", headers=auth_headers)
        except Exception:
            pass
    try:
        client.delete(f"{INVENTORY_ENDPOINT}/{inventory_id}", headers=auth_headers)
    except Exception:
        pass


@pytest.fixture(scope='function')
def empty_inventory(client, auth_headers, id):
    """Create an empty inventory for testing."""
    response = client.post(f"{INVENTORY_ENDPOINT}/create", headers=auth_headers, json={})
    assert response.status_code == 201
    inventory_data = json.loads(response.data)

    yield inventory_data

    try:
        client.delete(f"{INVENTORY_ENDPOINT}/{inventory_data['id']}", headers=auth_headers)
    except Exception:
        pass


@pytest.fixture(scope="function")
def trip_w_o_itinerary(client, auth_headers):
    """Create a trip without an itinerary."""
    response = client.post(f"{TRIP_ENDPOINT}/create", json={"inventory": {}}, headers=auth_headers)
    assert response.status_code == 201
    trip_data = json.loads(response.data)

    yield trip_data

    try:
        client.delete(f"{TRIP_ENDPOINT}/{trip_data['id']}", headers=auth_headers)
    except Exception:
        pass

@pytest.fixture(scope="function")
def itinerary(client, auth_headers, trip_w_o_itinerary):
    days = [
        {
            "dayNumber": 1,
            "date": date.fromisoformat('2020-12-31').strftime("%Y-%m-%d"),
            "points": [],
        },
        {
            "dayNumber": 2,
            "date": date.fromisoformat('2020-01-01').strftime("%Y-%m-%d"),
            "points": []
        }
    ]

    itinerary = {"days": days, "tripId": trip_w_o_itinerary["id"]}
    response = client.post(f"{ITINERARY_ENDPOINT}/create", json=itinerary, headers=auth_headers)
    assert response.status_code == 201

    itinerary_data = json.loads(response.data)

    yield itinerary_data

     # Cleanup: try to delete the itinerary
    try:
        client.delete(f"{ITINERARY_ENDPOINT}/{itinerary_data['id']}", headers=auth_headers)
    except:
        pass


@pytest.fixture(scope="function")
def trip_with_invitation(client, auth_headers, user_2, auth_headers_2):
    """
    Creates a trip (user_1=leader) with a pending invitation to user_2.

    Yields a dict:
        {
            "trip": <trip response dict>,
            "leader_headers": <auth headers for user_1>,
            "invitee_headers": <auth headers for user_2>,
            "invitee_id": <user_2 id string>,
        }
    """
    response = client.post(
        f"{TRIP_ENDPOINT}/create",
        json={"inventory": {}, "itinerary": {"isPublic": True, "totalMiles": 0, "days": []}},
        headers=auth_headers,
    )
    assert response.status_code == 201
    trip_data = json.loads(response.data)
    trip_id = trip_data["id"]

    inv_response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/invite",
        json={"email": user_2.mail},
        headers=auth_headers,
    )
    assert inv_response.status_code == 201

    yield {
        "trip": trip_data,
        "leader_headers": auth_headers,
        "invitee_headers": auth_headers_2,
        "invitee_id": str(user_2.id),
        "invitee_email": user_2.mail,
    }

    try:
        client.delete(f"{TRIP_ENDPOINT}/{trip_id}?for_everyone=true", headers=auth_headers)
    except Exception:
        pass


@pytest.fixture(scope="function")
def trip_with_user2_as_crew(client, auth_headers, user_2, auth_headers_2):
    """
    Creates a trip (user_1=leader), invites user_2, and has user_2 accept.

    Yields a dict:
        {
            "trip": <trip response dict>,
            "leader_headers": <auth headers for user_1>,
            "crew_headers": <auth headers for user_2>,
            "crew_id": <user_2 id string>,
        }
    """
    response = client.post(
        f"{TRIP_ENDPOINT}/create",
        json={"inventory": {}, "itinerary": {"isPublic": True, "totalMiles": 0, "days": []}},
        headers=auth_headers,
    )
    assert response.status_code == 201
    trip_data = json.loads(response.data)
    trip_id = trip_data["id"]

    inv_response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/invite",
        json={"email": user_2.mail},
        headers=auth_headers,
    )
    assert inv_response.status_code == 201

    accept_response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/invitation",
        json={"accepted": True},
        headers=auth_headers_2,
    )
    assert accept_response.status_code == 200

    yield {
        "trip": trip_data,
        "leader_headers": auth_headers,
        "crew_headers": auth_headers_2,
        "crew_id": str(user_2.id),
        "crew_email": user_2.mail,
    }

    try:
        client.delete(f"{TRIP_ENDPOINT}/{trip_id}?for_everyone=true", headers=auth_headers)
    except Exception:
        pass


@pytest.fixture(scope="function")
def trip_with_crew(app, client, auth_headers):
    """
    Creates a trip (user_1 = leader) and a fresh crew member.

    Yields a dict:
        {
            "trip": <trip response dict>,
            "leader_headers": <auth headers for user_1>,
            "crew_headers": <auth headers for the crew user>,
        }

    Tears down both the crew user and the trip after the test.
    """
    # Create the trip (user_1 is the leader)
    response = client.post(
        f"{TRIP_ENDPOINT}/create",
        json={"inventory": {}, "itinerary": {"isPublic": True, "totalMiles": 0, "days": []}},
        headers=auth_headers,
    )
    assert response.status_code == 201
    trip_data = json.loads(response.data)
    trip_id = trip_data["id"]

    # Register a fresh crew user
    crew_data = {
        "mail": "crew.member@example.com",
        "pwd": "CrewPass9$",
        "phone": "+39099900003",
        "name": "Crew",
        "username": "crew_member_tmp",
    }
    client.post("/api/auth/register", json=crew_data)

    with app.app_context():
        crew_user = _activate_user("crew.member@example.com")
        assert crew_user is not None
        crew_id = str(crew_user.id)
        crew_token = JWTService.generate_access_token(str(crew_user.id), crew_user.mail, crew_user.admin)

        # Directly insert crew membership (invitation flow is M3a)
        membership = TripMemberSchema().load({
            'user_id': crew_user.id,
            'trip_id': UUID(trip_id),
            'role': MemberRoleType.CREW.value,
        })
        _db.session.add(membership)
        _db.session.commit()

    yield {
        "trip": trip_data,
        "leader_headers": auth_headers,
        "crew_headers": {"Authorization": f"Bearer {crew_token}"},
    }

    # Cleanup crew user and trip
    with app.app_context():
        crew_user = _db.session.query(User).filter_by(id=UUID(crew_id)).first()
        if crew_user:
            _db.session.delete(crew_user)
            _db.session.commit()

    try:
        client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)
    except:
        pass
