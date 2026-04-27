from decimal import ROUND_HALF_UP, Decimal

from django.db.models import DecimalField, F, Sum
from django.db.models.functions import Coalesce

from products.models import Product
from purchases.models import PurchaseOrder, PurchaseOrderItem
from sales.models import SalesOrder, SalesOrderItem


_TWO_PLACES = Decimal("0.01")


def _decimal(value):
    return value if value is not None else Decimal("0")


def _money(value):
    return _decimal(value).quantize(_TWO_PLACES, rounding=ROUND_HALF_UP)


def product_financial_summary(product, user):
    p_cost = PurchaseOrderItem.objects.filter(
        product=product,
        purchase_order__status=PurchaseOrder.Status.CONFIRMED,
        purchase_order__created_by=user,
    ).aggregate(
        total_qty=Coalesce(Sum("quantity"), Decimal("0"), output_field=DecimalField()),
        total_cost=Coalesce(
            Sum(F("quantity") * F("unit_price"), output_field=DecimalField()),
            Decimal("0"),
            output_field=DecimalField(),
        ),
    )

    p_revenue = SalesOrderItem.objects.filter(
        product=product,
        sales_order__status=SalesOrder.Status.CONFIRMED,
        sales_order__created_by=user,
    ).aggregate(
        total_qty=Coalesce(Sum("quantity"), Decimal("0"), output_field=DecimalField()),
        total_revenue=Coalesce(
            Sum(F("quantity") * F("unit_price"), output_field=DecimalField()),
            Decimal("0"),
            output_field=DecimalField(),
        ),
    )

    current_stock = product.stocks.filter(created_by=user).aggregate(
        total=Coalesce(
            Sum("available_quantity"), Decimal("0"), output_field=DecimalField()
        )
    )["total"]

    total_cost = _decimal(p_cost["total_cost"])
    total_revenue = _decimal(p_revenue["total_revenue"])
    profit = total_revenue - total_cost
    margin = (profit / total_cost * 100) if total_cost > 0 else Decimal("0")

    return {
        "product_id": product.id,
        "product_name": product.name,
        "total_purchased_quantity": str(_decimal(p_cost["total_qty"])),
        "total_purchase_cost": str(_money(total_cost)),
        "total_sold_quantity": str(_decimal(p_revenue["total_qty"])),
        "total_sales_revenue": str(_money(total_revenue)),
        "profit": str(_money(profit)),
        "profit_margin": str(_money(margin)),
        "current_stock": str(_decimal(current_stock)),
    }


def overall_totals(user):
    total_cost = PurchaseOrderItem.objects.filter(
        purchase_order__created_by=user,
        purchase_order__status=PurchaseOrder.Status.CONFIRMED,
    ).aggregate(
        total=Coalesce(
            Sum(F("quantity") * F("unit_price"), output_field=DecimalField()),
            Decimal("0"),
            output_field=DecimalField(),
        )
    )["total"]

    total_revenue = SalesOrderItem.objects.filter(
        sales_order__created_by=user,
        sales_order__status=SalesOrder.Status.CONFIRMED,
    ).aggregate(
        total=Coalesce(
            Sum(F("quantity") * F("unit_price"), output_field=DecimalField()),
            Decimal("0"),
            output_field=DecimalField(),
        )
    )["total"]

    total_cost = _decimal(total_cost)
    total_revenue = _decimal(total_revenue)
    profit = total_revenue - total_cost
    margin = (profit / total_cost * 100) if total_cost > 0 else Decimal("0")

    return {
        "total_revenue": _money(total_revenue),
        "total_cost": _money(total_cost),
        "total_profit": _money(profit),
        "profit_margin": _money(margin),
    }


def all_products_summary(user):
    return [
        product_financial_summary(product, user)
        for product in Product.objects.filter(created_by=user)
    ]
