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


def _placemark(
    time_utc: str,
    lng: float,
    lat: float,
    course: str | None = None,
    velocity: str | None = None,
) -> str:
    extra = ""
    if course is not None:
        extra += f'<Data name="Course"><value>{course}</value></Data>'
    if velocity is not None:
        extra += f'<Data name="Velocity"><value>{velocity}</value></Data>'
    return f"""
    <Placemark>
      <name>{time_utc}</name>
      <ExtendedData>
        <Data name="Time UTC"><value>{time_utc}</value></Data>
        {extra}
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


class TestHeadingAndSpeed:
    # The text format of Course and Velocity is assumed ("123.00 ° True", "5.4 km/h"), not
    # copied from a real feed; these tests pin the parser's tolerance, not Garmin's format.
    @staticmethod
    def _parse_one(course: str | None, velocity: str | None):
        kml = _kml(_placemark("2026-09-14T10:15:00Z", -8.123, 43.456, course, velocity))
        (position,) = SOURCE.parse(kml, since=None)
        return position

    def test_reads_course_as_degrees_and_converts_velocity_to_metres_per_second(self):
        position = self._parse_one("123.00 ° True", "18.0 km/h")

        assert position.heading_deg == 123.0
        assert position.speed_ms == pytest.approx(5.0)

    def test_a_bare_number_is_taken_as_degrees_and_km_per_hour(self):
        position = self._parse_one("90", "36")

        assert position.heading_deg == 90.0
        assert position.speed_ms == pytest.approx(10.0)

    def test_a_stationary_device_reports_zero_speed_not_none(self):
        position = self._parse_one("0.00 ° True", "0.0 km/h")

        assert position.heading_deg == 0.0
        assert position.speed_ms == 0.0

    def test_missing_fields_leave_both_none_and_keep_the_position(self):
        position = self._parse_one(None, None)

        assert position.heading_deg is None
        assert position.speed_ms is None
        assert position.lat == 43.456

    @pytest.mark.parametrize("course", ["", "n/a", "° True", "-5.0 ° True", "361 ° True"])
    def test_unusable_course_is_none(self, course):
        assert self._parse_one(course, None).heading_deg is None

    @pytest.mark.parametrize("velocity", ["", "n/a", "km/h", "-3.0 km/h", "12 mph", "6 kn"])
    def test_unusable_or_foreign_unit_velocity_is_none(self, velocity):
        # A unit other than km/h is refused rather than guessed at: a wrong speed on a
        # safety map is worse than an absent one.
        assert self._parse_one(None, velocity).speed_ms is None

    def test_one_bad_field_does_not_discard_the_other(self):
        position = self._parse_one("n/a", "18.0 km/h")

        assert position.heading_deg is None
        assert position.speed_ms == pytest.approx(5.0)

    def test_each_point_carries_its_own_values(self):
        kml = _kml(
            _placemark("2026-09-14T10:15:00Z", -8.123, 43.456, "10.00 ° True", "3.6 km/h"),
            _placemark("2026-09-14T10:25:00Z", -8.130, 43.460, "200.00 ° True", "7.2 km/h"),
        )
        first, second = SOURCE.parse(kml, since=None)

        assert (first.heading_deg, second.heading_deg) == (10.0, 200.0)
        assert first.speed_ms == pytest.approx(1.0)
        assert second.speed_ms == pytest.approx(2.0)


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
