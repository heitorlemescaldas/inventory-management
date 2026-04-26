import pytest

from products.models import Product


PO_URL = "/api/purchase-orders/"
SO_URL = "/api/sales-orders/"
DASHBOARD_URL = "/api/finance/dashboard/"


def _create_and_confirm_po(client, product_id, quantity, unit_price):
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
    response = client.post(f"{PO_URL}{po['id']}/confirm/")
    assert response.status_code == 200, response.content
    return po


def _create_and_confirm_so(client, product_id, quantity, unit_price):
    so = client.post(
        SO_URL,
        {
            "customer": "C",
            "items": [
                {"product": product_id, "quantity": quantity, "unit_price": unit_price}
            ],
        },
        format="json",
    ).json()
    response = client.post(f"{SO_URL}{so['id']}/confirm/")
    assert response.status_code == 200, response.content
    return so


def _create_draft_po(client, product_id, quantity, unit_price):
    return client.post(
        PO_URL,
        {
            "supplier": "S",
            "items": [
                {"product": product_id, "quantity": quantity, "unit_price": unit_price}
            ],
        },
        format="json",
    ).json()


def _create_draft_so(client, product_id, quantity, unit_price):
    return client.post(
        SO_URL,
        {
            "customer": "C",
            "items": [
                {"product": product_id, "quantity": quantity, "unit_price": unit_price}
            ],
        },
        format="json",
    ).json()


@pytest.mark.django_db
def test_example_scenario(authenticated_client, sample_product):
    _create_and_confirm_po(authenticated_client, sample_product.id, "100", "1.00")
    _create_and_confirm_so(authenticated_client, sample_product.id, "100", "10.00")

    response = authenticated_client.get(DASHBOARD_URL)
    assert response.status_code == 200
    body = response.json()
    assert body["total_cost"] == "100.00"
    assert body["total_revenue"] == "1000.00"
    assert body["total_profit"] == "900.00"
    assert body["profit_margin"] == "900.00"


@pytest.mark.django_db
def test_dashboard_empty(authenticated_client):
    response = authenticated_client.get(DASHBOARD_URL)

    assert response.status_code == 200
    body = response.json()
    assert body["total_cost"] == "0.00"
    assert body["total_revenue"] == "0.00"
    assert body["total_profit"] == "0.00"
    assert body["profit_margin"] == "0.00"
    assert body["products_summary"] == []


@pytest.mark.django_db
def test_dashboard_multiple_products(authenticated_client, user):
    p1 = Product.objects.create(name="P1", sku="P1", unit_type="unit", created_by=user)
    p2 = Product.objects.create(name="P2", sku="P2", unit_type="unit", created_by=user)

    _create_and_confirm_po(authenticated_client, p1.id, "10", "2.00")
    _create_and_confirm_po(authenticated_client, p2.id, "5", "4.00")
    _create_and_confirm_so(authenticated_client, p1.id, "10", "5.00")
    _create_and_confirm_so(authenticated_client, p2.id, "5", "10.00")

    body = authenticated_client.get(DASHBOARD_URL).json()

    assert body["total_cost"] == "40.00"
    assert body["total_revenue"] == "100.00"
    assert body["total_profit"] == "60.00"
    assert body["profit_margin"] == "150.00"
    assert len(body["products_summary"]) == 2

    by_id = {row["product_id"]: row for row in body["products_summary"]}
    assert by_id[p1.id]["total_purchase_cost"] == "20.00"
    assert by_id[p1.id]["total_sales_revenue"] == "50.00"
    assert by_id[p2.id]["total_purchase_cost"] == "20.00"
    assert by_id[p2.id]["total_sales_revenue"] == "50.00"


@pytest.mark.django_db
def test_dashboard_ignores_draft_and_cancelled_orders(
    authenticated_client, sample_product
):
    _create_and_confirm_po(authenticated_client, sample_product.id, "10", "2.00")
    _create_and_confirm_so(authenticated_client, sample_product.id, "5", "5.00")

    _create_draft_po(authenticated_client, sample_product.id, "100", "999.00")

    cancelled_po = _create_draft_po(authenticated_client, sample_product.id, "50", "100.00")
    authenticated_client.post(f"{PO_URL}{cancelled_po['id']}/cancel/")

    cancelled_so = _create_draft_so(authenticated_client, sample_product.id, "1", "9999.00")
    authenticated_client.post(f"{SO_URL}{cancelled_so['id']}/cancel/")

    body = authenticated_client.get(DASHBOARD_URL).json()

    assert body["total_cost"] == "20.00"
    assert body["total_revenue"] == "25.00"
    assert body["total_profit"] == "5.00"


@pytest.mark.django_db
def test_product_financial_endpoint(authenticated_client, sample_product):
    _create_and_confirm_po(authenticated_client, sample_product.id, "10", "3.00")
    _create_and_confirm_so(authenticated_client, sample_product.id, "4", "5.00")

    response = authenticated_client.get(f"/api/finance/products/{sample_product.id}/")

    assert response.status_code == 200
    body = response.json()
    assert body["product_id"] == sample_product.id
    assert body["product_name"] == sample_product.name
    assert body["total_purchase_cost"] == "30.00"
    assert body["total_sales_revenue"] == "20.00"
    assert body["profit"] == "-10.00"
    assert body["total_purchased_quantity"] == "10.0000"
    assert body["total_sold_quantity"] == "4.0000"


@pytest.mark.django_db
def test_product_financial_other_user_404(
    other_authenticated_client, sample_product
):
    response = other_authenticated_client.get(
        f"/api/finance/products/{sample_product.id}/"
    )

    assert response.status_code == 404
