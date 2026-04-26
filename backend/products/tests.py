import pytest

from products.models import Product, Stock


PRODUCTS_URL = "/api/products/"
STOCKS_URL = "/api/stocks/"


def _results(response):
    body = response.json()
    return body["results"] if isinstance(body, dict) and "results" in body else body


@pytest.mark.django_db
def test_create_product(authenticated_client, user):
    response = authenticated_client.post(
        PRODUCTS_URL,
        {
            "name": "Banana",
            "description": "Fresh bananas",
            "sku": "BAN-001",
            "unit_type": "kg",
        },
        format="json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Banana"
    assert body["sku"] == "BAN-001"
    assert Product.objects.filter(id=body["id"], created_by=user).exists()


@pytest.mark.django_db
def test_list_products_returns_only_own(
    authenticated_client, other_authenticated_client, sample_product, other_user
):
    Product.objects.create(
        name="Other Product",
        sku="OTHER-001",
        unit_type="unit",
        created_by=other_user,
    )

    response = authenticated_client.get(PRODUCTS_URL)
    assert response.status_code == 200
    results = _results(response)
    assert len(results) == 1
    assert results[0]["sku"] == sample_product.sku

    response2 = other_authenticated_client.get(PRODUCTS_URL)
    results2 = _results(response2)
    assert len(results2) == 1
    assert results2[0]["sku"] == "OTHER-001"


@pytest.mark.django_db
def test_duplicate_sku_same_user_400(authenticated_client, sample_product):
    response = authenticated_client.post(
        PRODUCTS_URL,
        {
            "name": "Dup",
            "sku": sample_product.sku,
            "unit_type": "unit",
        },
        format="json",
    )

    assert response.status_code == 400
    assert "sku" in response.json()


@pytest.mark.django_db
def test_duplicate_sku_different_user_ok(
    other_authenticated_client, sample_product
):
    response = other_authenticated_client.post(
        PRODUCTS_URL,
        {
            "name": "Same SKU different owner",
            "sku": sample_product.sku,
            "unit_type": "kg",
        },
        format="json",
    )

    assert response.status_code == 201


@pytest.mark.django_db
def test_delete_product(authenticated_client, sample_product):
    response = authenticated_client.delete(f"{PRODUCTS_URL}{sample_product.id}/")
    assert response.status_code == 204
    assert not Product.objects.filter(id=sample_product.id).exists()


@pytest.mark.django_db
def test_search_products(authenticated_client, user):
    Product.objects.create(name="Apple Pie", sku="AP-1", unit_type="unit", created_by=user)
    Product.objects.create(name="Bread", sku="BR-1", unit_type="unit", created_by=user)
    Product.objects.create(name="Apple Juice", sku="AJ-1", unit_type="L", created_by=user)

    response = authenticated_client.get(f"{PRODUCTS_URL}?search=Apple")
    assert response.status_code == 200
    results = _results(response)
    names = sorted(r["name"] for r in results)
    assert names == ["Apple Juice", "Apple Pie"]


@pytest.mark.django_db
def test_create_stock_manual(authenticated_client, sample_product, user):
    response = authenticated_client.post(
        STOCKS_URL,
        {
            "product": sample_product.id,
            "quantity": "5",
            "unit_cost": "2.50",
        },
        format="json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["available_quantity"] == "5.0000"
    assert body["quantity"] == "5.0000"
    assert body["source"] == Stock.Source.MANUAL

    stock = Stock.objects.get(id=body["id"])
    assert stock.created_by_id == user.id
    assert stock.available_quantity == stock.quantity


@pytest.mark.django_db
def test_list_stocks_filtered_by_product(authenticated_client, sample_product, user):
    other_product = Product.objects.create(
        name="Other", sku="OTH-1", unit_type="unit", created_by=user
    )
    Stock.objects.create(
        product=sample_product,
        quantity=3,
        available_quantity=3,
        unit_cost="1.00",
        source=Stock.Source.MANUAL,
        created_by=user,
    )
    Stock.objects.create(
        product=other_product,
        quantity=7,
        available_quantity=7,
        unit_cost="1.00",
        source=Stock.Source.MANUAL,
        created_by=user,
    )

    response = authenticated_client.get(f"{STOCKS_URL}?product={sample_product.id}")
    assert response.status_code == 200
    results = _results(response)
    assert len(results) == 1
    assert results[0]["product"] == sample_product.id
