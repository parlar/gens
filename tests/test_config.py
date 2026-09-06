"""The configuration guards that decide whether the app is safe to start.

The session signing key is the one that matters most: anyone who knows it can
mint a session cookie for any existing user, so a deployment that runs with a
guessable one is not authenticated at all, however carefully the login page is
written.
"""

import pytest
from pydantic import ValidationError

from gens.config import DEFAULT_SECRET_KEY, AuthMethod, Settings

BASE = {
    "gens_db": {"connection": "mongodb://localhost:27017/gens"},
    "gens_api_url": "http://localhost:5000/api/",
}


def build(**overrides) -> Settings:
    return Settings(**{**BASE, **overrides})


class TestTheSessionSigningKey:
    @pytest.mark.parametrize(
        "secret_key",
        [
            pytest.param(DEFAULT_SECRET_KEY, id="the published default"),
            pytest.param("", id="empty"),
            pytest.param("   ", id="whitespace"),
        ],
    )
    def test_authentication_will_not_start_without_a_private_key(self, secret_key):
        # Empty is the one that is easy to miss: an unset environment variable
        # arrives as the empty string rather than as a missing value, so a
        # check for only the default lets SECRET_KEY= through and the app signs
        # cookies with nothing at all.
        with pytest.raises(ValidationError, match="secret_key must be set"):
            build(authentication="simple", secret_key=secret_key)

    def test_the_message_says_how_to_fix_it(self):
        # This is read by someone whose deployment just refused to start.
        with pytest.raises(ValidationError) as raised:
            build(authentication="simple", secret_key="")
        message = str(raised.value)
        assert "SECRET_KEY" in message
        assert "GENS_SECRET_KEY" in message
        assert "AUTHENTICATION=disabled" in message

    def test_a_private_key_is_accepted(self):
        settings = build(authentication="simple", secret_key="a-private-value")
        assert settings.authentication is AuthMethod.SIMPLE

    def test_a_demo_with_no_login_needs_no_key(self):
        # docker-compose passes SECRET_KEY through empty, and this is the path
        # that has to keep working when someone sets AUTHENTICATION=disabled.
        settings = build(authentication="disabled", secret_key="")
        assert settings.authentication is AuthMethod.DISABLED
