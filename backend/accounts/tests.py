import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


REGISTER_URL = "/api/auth/register/"
LOGIN_URL = "/api/auth/login/"
REFRESH_URL = "/api/auth/refresh/"
ME_URL = "/api/auth/me/"


@pytest.mark.django_db
def test_register_success():
    client = APIClient()
    response = client.post(
        REGISTER_URL,
        {"username": "newuser", "email": "new@example.com", "password": "strongpass1"},
        format="json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["username"] == "newuser"
    assert body["email"] == "new@example.com"
    assert "id" in body
    assert "password" not in body


@pytest.mark.django_db
def test_register_duplicate_username(user):
    client = APIClient()
    response = client.post(
        REGISTER_URL,
        {"username": user.username, "email": "x@example.com", "password": "anotherpass1"},
        format="json",
    )

    assert response.status_code == 400


@pytest.mark.django_db
def test_register_short_password():
    client = APIClient()
    response = client.post(
        REGISTER_URL,
        {"username": "shorty", "email": "s@example.com", "password": "abc"},
        format="json",
    )

    assert response.status_code == 400


@pytest.mark.django_db
def test_login_success(user):
    client = APIClient()
    response = client.post(
        LOGIN_URL,
        {"username": user.username, "password": "alicepass123"},
        format="json",
    )

    assert response.status_code == 200
    body = response.json()
    assert "access" in body
    assert "refresh" in body


@pytest.mark.django_db
def test_login_wrong_password(user):
    client = APIClient()
    response = client.post(
        LOGIN_URL,
        {"username": user.username, "password": "wrongpassword"},
        format="json",
    )

    assert response.status_code == 401


@pytest.mark.django_db
def test_me_authenticated(authenticated_client, user):
    response = authenticated_client.get(ME_URL)

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == user.id
    assert body["username"] == user.username
    assert body["email"] == user.email


@pytest.mark.django_db
def test_me_unauthenticated():
    client = APIClient()
    response = client.get(ME_URL)

    assert response.status_code == 401


@pytest.mark.django_db
def test_refresh_token(user):
    client = APIClient()
    login = client.post(
        LOGIN_URL,
        {"username": user.username, "password": "alicepass123"},
        format="json",
    )
    refresh_token = login.json()["refresh"]

    response = client.post(REFRESH_URL, {"refresh": refresh_token}, format="json")

    assert response.status_code == 200
    assert "access" in response.json()
