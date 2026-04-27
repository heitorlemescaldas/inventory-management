from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from products.models import Product, Stock
from purchases.models import PurchaseOrder, PurchaseOrderItem
from sales.models import SalesOrder, SalesOrderItem

User = get_user_model()


products_data = [
    {
        "name": "Organic Orange Juice",
        "sku": "OJ-001",
        "unit_type": "L",
        "description": "Cold-pressed organic orange juice",
    },
    {
        "name": "Sparkling Water",
        "sku": "SW-001",
        "unit_type": "mL",
        "description": "Natural mineral sparkling water 500mL",
    },
    {
        "name": "Granola Bar",
        "sku": "GB-001",
        "unit_type": "unit",
        "description": "Oat and honey granola bar",
    },
    {
        "name": "Greek Yogurt",
        "sku": "GY-001",
        "unit_type": "g",
        "description": "Plain Greek yogurt 200g pot",
    },
    {
        "name": "Ground Coffee",
        "sku": "GC-001",
        "unit_type": "kg",
        "description": "Medium roast Arabica ground coffee",
    },
    {
        "name": "Protein Shake",
        "sku": "PS-001",
        "unit_type": "mL",
        "description": "Chocolate whey protein shake 350mL",
    },
]


confirmed_po_specs = [
    {
        "supplier": "FreshFarm Distributors",
        "items": [
            {"sku": "OJ-001", "quantity": 200, "unit_price": "3.50"},
            {"sku": "GY-001", "quantity": 500, "unit_price": "1.20"},
            {"sku": "GB-001", "quantity": 300, "unit_price": "0.85"},
        ],
    },
    {
        "supplier": "BeverageCo Wholesale",
        "items": [
            {"sku": "SW-001", "quantity": 1000, "unit_price": "0.45"},
            {"sku": "PS-001", "quantity": 150, "unit_price": "2.80"},
            {"sku": "GC-001", "quantity": 50, "unit_price": "12.00"},
        ],
    },
    {
        "supplier": "Organic Valley Supply",
        "items": [
            {"sku": "OJ-001", "quantity": 100, "unit_price": "3.20"},
            {"sku": "GY-001", "quantity": 200, "unit_price": "1.15"},
        ],
    },
]


draft_po_spec = {
    "supplier": "NewVendor Inc.",
    "items": [
        {"sku": "GB-001", "quantity": 500, "unit_price": "0.80"},
        {"sku": "GC-001", "quantity": 100, "unit_price": "11.50"},
    ],
}


confirmed_so_specs = [
    {
        "customer": "GreenMart Supermarket",
        "items": [
            {"sku": "OJ-001", "quantity": 150, "unit_price": "6.99"},
            {"sku": "SW-001", "quantity": 400, "unit_price": "1.29"},
            {"sku": "GB-001", "quantity": 200, "unit_price": "2.49"},
            {"sku": "GY-001", "quantity": 300, "unit_price": "2.99"},
        ],
    },
    {
        "customer": "FitLife Health Store",
        "items": [
            {"sku": "PS-001", "quantity": 80, "unit_price": "5.49"},
            {"sku": "GC-001", "quantity": 30, "unit_price": "24.99"},
            {"sku": "GB-001", "quantity": 50, "unit_price": "2.29"},
            {"sku": "GY-001", "quantity": 100, "unit_price": "3.19"},
        ],
    },
]


class Command(BaseCommand):
    help = "Seed database with demo data for evaluation (user: demo / demo1234)"

    def handle(self, *args, **options):
        if User.objects.filter(username="demo").exists():
            self.stdout.write(
                self.style.WARNING(
                    "Demo user already exists — skipping. "
                    "To re-seed, delete the user first: "
                    "User.objects.filter(username='demo').delete()"
                )
            )
            return

        with transaction.atomic():
            user = User.objects.create_user(
                username="demo",
                email="demo@example.com",
                password="demo1234",
            )

            products = {}
            for p in products_data:
                products[p["sku"]] = Product.objects.create(created_by=user, **p)

            for po_spec in confirmed_po_specs:
                po = PurchaseOrder.objects.create(
                    supplier=po_spec["supplier"],
                    notes=po_spec.get("notes", ""),
                    created_by=user,
                    status=PurchaseOrder.Status.DRAFT,
                )
                for item_spec in po_spec["items"]:
                    PurchaseOrderItem.objects.create(
                        purchase_order=po,
                        product=products[item_spec["sku"]],
                        quantity=Decimal(str(item_spec["quantity"])),
                        unit_price=Decimal(str(item_spec["unit_price"])),
                    )
                for item in po.items.all():
                    Stock.objects.create(
                        product=item.product,
                        quantity=item.quantity,
                        available_quantity=item.quantity,
                        unit_cost=item.unit_price,
                        source=Stock.Source.PURCHASE_ORDER,
                        purchase_order_item=item,
                        created_by=user,
                    )
                po.status = PurchaseOrder.Status.CONFIRMED
                po.save()

            draft_po = PurchaseOrder.objects.create(
                supplier=draft_po_spec["supplier"],
                notes=draft_po_spec.get("notes", ""),
                created_by=user,
                status=PurchaseOrder.Status.DRAFT,
            )
            for item_spec in draft_po_spec["items"]:
                PurchaseOrderItem.objects.create(
                    purchase_order=draft_po,
                    product=products[item_spec["sku"]],
                    quantity=Decimal(str(item_spec["quantity"])),
                    unit_price=Decimal(str(item_spec["unit_price"])),
                )

            for so_spec in confirmed_so_specs:
                so = SalesOrder.objects.create(
                    customer=so_spec["customer"],
                    notes=so_spec.get("notes", ""),
                    created_by=user,
                    status=SalesOrder.Status.DRAFT,
                )
                for item_spec in so_spec["items"]:
                    SalesOrderItem.objects.create(
                        sales_order=so,
                        product=products[item_spec["sku"]],
                        quantity=Decimal(str(item_spec["quantity"])),
                        unit_price=Decimal(str(item_spec["unit_price"])),
                    )
                for item in so.items.select_related("product"):
                    remaining = item.quantity
                    stocks = Stock.objects.filter(
                        product=item.product,
                        created_by=user,
                        available_quantity__gt=0,
                    ).order_by("created_at")
                    for stock in stocks:
                        if remaining <= 0:
                            break
                        deduct = min(stock.available_quantity, remaining)
                        stock.available_quantity -= deduct
                        stock.save()
                        remaining -= deduct
                so.status = SalesOrder.Status.CONFIRMED
                so.save()

        self.stdout.write(
            self.style.SUCCESS(
                "Demo data seeded successfully!\n"
                "  Login: demo / demo1234\n"
                "  Products: 6\n"
                "  Purchase Orders: 3 confirmed + 1 draft\n"
                "  Sales Orders: 2 confirmed"
            )
        )
