import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from products.models import Product


@pytest.fixture
def user(db):
    User = get_user_model()
    return User.objects.create_user(
        username="alice",
        email="alice@example.com",
        password="alicepass123",
    )


@pytest.fixture
def other_user(db):
    User = get_user_model()
    return User.objects.create_user(
        username="bob",
        email="bob@example.com",
        password="bobpass123",
    )


@pytest.fixture
def authenticated_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def other_authenticated_client(other_user):
    client = APIClient()
    client.force_authenticate(user=other_user)
    return client


@pytest.fixture
def sample_product(user):
    return Product.objects.create(
        name="Apple",
        description="Fresh apples",
        sku="APPLE-001",
        unit_type="kg",
        created_by=user,
    )
