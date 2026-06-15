"""§4 Global wind vectors endpoint tests."""
from unittest.mock import patch


def test_global_wind_requires_auth(client):
    resp = client.get("/api/day/global-wind-vectors?date=2026-07-15&hour=12")
    assert resp.status_code == 401


def test_global_wind_missing_date_returns_400(client, auth_headers):
    resp = client.get("/api/day/global-wind-vectors?hour=12", headers=auth_headers)
    assert resp.status_code == 400


def test_global_wind_returns_grid_from_service(client, auth_headers):
    fake_grid = {
        "source": "global_weather",
        "grid": [
            {
                "header": {
                    "parameterUnit": "m.s-1",
                    "parameterCategory": 2,
                    "parameterNumber": 2,
                    "parameterNumberName": "eastward_component",
                    "la1": 80.0,
                    "la2": -80.0,
                    "lo1": -170.0,
                    "lo2": 170.0,
                    "nx": 35,
                    "ny": 17,
                    "dx": 10.0,
                    "dy": 10.0,
                },
                "data": [0.5] * (35 * 17),
            },
            {
                "header": {
                    "parameterUnit": "m.s-1",
                    "parameterCategory": 2,
                    "parameterNumber": 3,
                    "parameterNumberName": "northward_component",
                    "la1": 80.0,
                    "la2": -80.0,
                    "lo1": -170.0,
                    "lo2": 170.0,
                    "nx": 35,
                    "ny": 17,
                    "dx": 10.0,
                    "dy": 10.0,
                },
                "data": [0.2] * (35 * 17),
            },
        ],
    }

    with patch(
        "Resources.sea_resource.OpenMeteoService.fetch_global_wind",
        return_value=fake_grid,
    ):
        resp = client.get(
            "/api/day/global-wind-vectors?date=2026-07-15&hour=12",
            headers=auth_headers,
        )

    assert resp.status_code == 200
    data = resp.get_json()
    assert data["source"] == "global_weather"
    assert len(data["grid"]) == 2
    u = next(g for g in data["grid"] if g["header"]["parameterNumberName"] == "eastward_component")
    assert u["header"]["nx"] == 35
    assert u["header"]["ny"] == 17
    assert len(u["data"]) == 35 * 17


def test_global_wind_default_hour_is_12(client, auth_headers):
    with patch(
        "Resources.sea_resource.OpenMeteoService.fetch_global_wind",
        return_value={"source": "global_weather", "grid": []},
    ) as mock_fetch:
        client.get("/api/day/global-wind-vectors?date=2026-07-15", headers=auth_headers)

    mock_fetch.assert_called_once_with("2026-07-15", 12)


def test_global_wind_passes_hour_to_service(client, auth_headers):
    with patch(
        "Resources.sea_resource.OpenMeteoService.fetch_global_wind",
        return_value={"source": "global_weather", "grid": []},
    ) as mock_fetch:
        client.get("/api/day/global-wind-vectors?date=2026-07-15&hour=18", headers=auth_headers)

    mock_fetch.assert_called_once_with("2026-07-15", 18)
