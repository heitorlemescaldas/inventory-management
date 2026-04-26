from decimal import Decimal

import pytest

from products.models import Product, Stock
from purchases.models import PurchaseOrder


PO_URL = "/api/purchase-orders/"


def _results(response):
    body = response.json()
    return body["results"] if isinstance(body, dict) and "results" in body else body


def _create_po(client, product_id, quantity="10", unit_price="2.00"):
    return client.post(
        PO_URL,
        {
            "supplier": "Acme",
            "items": [
                {"product": product_id, "quantity": quantity, "unit_price": unit_price}
            ],
        },
        format="json",
    )


@pytest.mark.django_db
def test_create_purchase_order_with_items(authenticated_client, sample_product):
    response = _create_po(authenticated_client, sample_product.id, "10", "2.00")

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["supplier"] == "Acme"
    assert len(body["items"]) == 1
    assert body["items"][0]["product"] == sample_product.id
    assert body["items"][0]["quantity"] == "10.0000"
    assert body["items"][0]["unit_price"] == "2.00"


@pytest.mark.django_db
def test_confirm_creates_stock_entries(authenticated_client, sample_product, user):
    po = _create_po(authenticated_client, sample_product.id, "10", "2.50").json()

    response = authenticated_client.post(f"{PO_URL}{po['id']}/confirm/")

    assert response.status_code == 200
    assert response.json()["status"] == "confirmed"

    stocks = Stock.objects.filter(product=sample_product, created_by=user)
    assert stocks.count() == 1
    stock = stocks.first()
    assert stock.quantity == Decimal("10")
    assert stock.available_quantity == Decimal("10")
    assert stock.unit_cost == Decimal("2.50")
    assert stock.source == Stock.Source.PURCHASE_ORDER


@pytest.mark.django_db
def test_confirm_already_confirmed_400(authenticated_client, sample_product):
    po = _create_po(authenticated_client, sample_product.id).json()
    authenticated_client.post(f"{PO_URL}{po['id']}/confirm/")

    response = authenticated_client.post(f"{PO_URL}{po['id']}/confirm/")

    assert response.status_code == 400
    assert "error" in response.json()


@pytest.mark.django_db
def test_cancel_draft_order(authenticated_client, sample_product):
    po = _create_po(authenticated_client, sample_product.id).json()

    response = authenticated_client.post(f"{PO_URL}{po['id']}/cancel/")

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert PurchaseOrder.objects.get(id=po["id"]).status == "cancelled"


@pytest.mark.django_db
def test_cancel_confirmed_400(authenticated_client, sample_product):
    po = _create_po(authenticated_client, sample_product.id).json()
    authenticated_client.post(f"{PO_URL}{po['id']}/confirm/")

    response = authenticated_client.post(f"{PO_URL}{po['id']}/cancel/")

    assert response.status_code == 400
    assert "error" in response.json()


@pytest.mark.django_db
def test_create_po_with_other_users_product_400(
    authenticated_client, other_user
):
    foreign_product = Product.objects.create(
        name="Foreign", sku="F-1", unit_type="unit", created_by=other_user
    )

    response = _create_po(authenticated_client, foreign_product.id)

    assert response.status_code == 400


@pytest.mark.django_db
def test_data_isolation(
    authenticated_client, other_authenticated_client, sample_product, other_user
):
    _create_po(authenticated_client, sample_product.id)

    foreign_product = Product.objects.create(
        name="Foreign", sku="F-1", unit_type="unit", created_by=other_user
    )
    _create_po(other_authenticated_client, foreign_product.id, "5", "9.99")

    alice_orders = _results(authenticated_client.get(PO_URL))
    bob_orders = _results(other_authenticated_client.get(PO_URL))

    assert len(alice_orders) == 1
    assert len(bob_orders) == 1
    assert alice_orders[0]["items"][0]["product"] == sample_product.id
    assert bob_orders[0]["items"][0]["product"] == foreign_product.id
