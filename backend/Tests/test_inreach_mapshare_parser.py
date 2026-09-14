from datetime import datetime, timezone

import pytest

from Services.SatelliteFeeds.base import FeedParseError
from Services.SatelliteFeeds.providers.inreach_mapshare import InReachMapShareSource
from Services.SatelliteFeeds.types import SatelliteProvider

SOURCE = InReachMapShareSource()


def _kml(*placemarks: str) -> bytes:
    body = "".join(placemarks)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>{body}</Document></kml>""".encode()


def _placemark(time_utc: str, lng: float, lat: float) -> str:
    return f"""
    <Placemark>
      <name>{time_utc}</name>
      <ExtendedData>
        <Data name="Time UTC"><value>{time_utc}</value></Data>
      </ExtendedData>
      <Point><coordinates>{lng},{lat},12.0</coordinates></Point>
    </Placemark>
    """


class TestParse:
    def test_parses_positions_oldest_first(self):
        kml = _kml(
            _placemark("2026-09-14T10:25:00Z", -8.130, 43.460),
            _placemark("2026-09-14T10:15:00Z", -8.123, 43.456),
        )
        positions = SOURCE.parse(kml, since=None)

        assert [p.timestamp.isoformat() for p in positions] == [
            "2026-09-14T10:15:00+00:00",
            "2026-09-14T10:25:00+00:00",
        ]
        assert positions[0].lat == 43.456
        assert positions[0].lng == -8.123
        assert positions[0].source == SatelliteProvider.INREACH_MAPSHARE

    def test_since_excludes_points_at_or_before_boundary(self):
        since = datetime(2026, 9, 14, 10, 15, 0, tzinfo=timezone.utc)
        kml = _kml(
            _placemark("2026-09-14T10:15:00Z", -8.123, 43.456),  # at boundary — excluded
            _placemark("2026-09-14T10:25:00Z", -8.130, 43.460),  # after — kept
        )
        positions = SOURCE.parse(kml, since=since)

        assert len(positions) == 1
        assert positions[0].timestamp == datetime(2026, 9, 14, 10, 25, 0, tzinfo=timezone.utc)

    def test_empty_feed_is_not_an_error(self):
        assert SOURCE.parse(_kml(), since=None) == []

    def test_malformed_body_raises_feed_parse_error(self):
        with pytest.raises(FeedParseError):
            SOURCE.parse(b"not xml at all <<<", since=None)

    def test_placemark_missing_coordinates_is_skipped_not_fatal(self):
        kml = _kml(
            """<Placemark>
                 <name>2026-09-14T10:15:00Z</name>
                 <ExtendedData><Data name="Time UTC"><value>2026-09-14T10:15:00Z</value></Data></ExtendedData>
               </Placemark>""",
            _placemark("2026-09-14T10:25:00Z", -8.130, 43.460),
        )
        positions = SOURCE.parse(kml, since=None)
        assert len(positions) == 1


class TestBuildRequest:
    def test_first_poll_omits_time_window(self):
        request = SOURCE.build_request("https://share.garmin.com/Feed/Share/id", None, since=None)
        assert request.url == "https://share.garmin.com/Feed/Share/id"
        assert request.headers == {}

    def test_subsequent_poll_passes_d1_d2(self):
        since = datetime(2026, 9, 14, 10, 15, 0, tzinfo=timezone.utc)
        request = SOURCE.build_request("https://share.garmin.com/Feed/Share/id", None, since=since)
        assert "d1=2026-09-14T10:15:00z" in request.url
        assert "d2=" in request.url

    def test_credentials_set_basic_auth_header(self):
        request = SOURCE.build_request(
            "https://share.garmin.com/Feed/Share/id",
            {"username": "paddler", "password": "s3cret"},
            since=None,
        )
        assert request.headers["Authorization"].startswith("Basic ")

    def test_no_credentials_omits_auth_header(self):
        request = SOURCE.build_request("https://share.garmin.com/Feed/Share/id", None, since=None)
        assert "Authorization" not in request.headers
