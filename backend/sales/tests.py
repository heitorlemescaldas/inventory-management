from decimal import Decimal

import pytest

from products.models import Product, Stock


PO_URL = "/api/purchase-orders/"
SO_URL = "/api/sales-orders/"


def _results(response):
    body = response.json()
    return body["results"] if isinstance(body, dict) and "results" in body else body


def _make_stock_via_po(client, product_id, quantity, unit_price):
    po = client.post(
        PO_URL,
        {
            "supplier": "S",
            "items": [
                {"product": product_id, "quantity": quantity, "unit_price": unit_price}
            ],
        },
        format="json",
    ).json()
    confirm = client.post(f"{PO_URL}{po['id']}/confirm/")
    assert confirm.status_code == 200
    return po


def _create_so(client, product_id, quantity, unit_price="10.00"):
    return client.post(
        SO_URL,
        {
            "customer": "Buyer",
            "items": [
                {"product": product_id, "quantity": quantity, "unit_price": unit_price}
            ],
        },
        format="json",
    )


@pytest.mark.django_db
def test_create_sales_order_with_items(authenticated_client, sample_product):
    response = _create_so(authenticated_client, sample_product.id, "5", "12.50")

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["customer"] == "Buyer"
    assert len(body["items"]) == 1
    assert body["items"][0]["quantity"] == "5.0000"
    assert body["items"][0]["unit_price"] == "12.50"


@pytest.mark.django_db
def test_confirm_deducts_stock_fifo(authenticated_client, sample_product, user):
    _make_stock_via_po(authenticated_client, sample_product.id, "10", "1.00")
    _make_stock_via_po(authenticated_client, sample_product.id, "10", "2.00")

    so = _create_so(authenticated_client, sample_product.id, "12", "5.00").json()
    response = authenticated_client.post(f"{SO_URL}{so['id']}/confirm/")

    assert response.status_code == 200
    assert response.json()["status"] == "confirmed"

    stocks = list(
        Stock.objects.filter(product=sample_product, created_by=user).order_by("created_at")
    )
    assert stocks[0].available_quantity == Decimal("0")
    assert stocks[0].quantity == Decimal("10")
    assert stocks[1].available_quantity == Decimal("8")
    assert stocks[1].quantity == Decimal("10")


@pytest.mark.django_db
def test_confirm_insufficient_stock_400(authenticated_client, sample_product):
    _make_stock_via_po(authenticated_client, sample_product.id, "5", "1.00")

    so = _create_so(authenticated_client, sample_product.id, "10", "5.00").json()
    response = authenticated_client.post(f"{SO_URL}{so['id']}/confirm/")

    assert response.status_code == 400
    body = response.json()
    assert "errors" in body
    assert any("Insufficient stock" in msg for msg in body["errors"])


@pytest.mark.django_db
def test_partial_stock_consumption(authenticated_client, sample_product, user):
    _make_stock_via_po(authenticated_client, sample_product.id, "10", "1.00")

    so = _create_so(authenticated_client, sample_product.id, "3", "5.00").json()
    authenticated_client.post(f"{SO_URL}{so['id']}/confirm/")

    stock = Stock.objects.get(product=sample_product, created_by=user)
    assert stock.available_quantity == Decimal("7")
    assert stock.quantity == Decimal("10")


@pytest.mark.django_db
def test_sequential_confirmations_drain_stock(
    authenticated_client, sample_product, user
):
    _make_stock_via_po(authenticated_client, sample_product.id, "10", "1.00")

    so1 = _create_so(authenticated_client, sample_product.id, "7", "5.00").json()
    so2 = _create_so(authenticated_client, sample_product.id, "7", "5.00").json()

    r1 = authenticated_client.post(f"{SO_URL}{so1['id']}/confirm/")
    r2 = authenticated_client.post(f"{SO_URL}{so2['id']}/confirm/")

    assert r1.status_code == 200
    assert r2.status_code == 400
    assert "errors" in r2.json()

    stock = Stock.objects.get(product=sample_product, created_by=user)
    assert stock.available_quantity == Decimal("3")


@pytest.mark.django_db
def test_data_isolation(
    authenticated_client,
    other_authenticated_client,
    sample_product,
    other_user,
):
    _make_stock_via_po(authenticated_client, sample_product.id, "5", "1.00")
    _create_so(authenticated_client, sample_product.id, "1", "5.00")

    foreign_product = Product.objects.create(
        name="Foreign", sku="F-1", unit_type="unit", created_by=other_user
    )
    Stock.objects.create(
        product=foreign_product,
        quantity=10,
        available_quantity=10,
        unit_cost="1.00",
        source=Stock.Source.MANUAL,
        created_by=other_user,
    )
    _create_so(other_authenticated_client, foreign_product.id, "2", "5.00")

    alice_orders = _results(authenticated_client.get(SO_URL))
    bob_orders = _results(other_authenticated_client.get(SO_URL))

    assert len(alice_orders) == 1
    assert len(bob_orders) == 1
    assert alice_orders[0]["items"][0]["product"] == sample_product.id
    assert bob_orders[0]["items"][0]["product"] == foreign_product.id
