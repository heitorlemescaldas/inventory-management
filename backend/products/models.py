from django.conf import settings
from django.db import models


class UnitType(models.TextChoices):
    KILOGRAM = "kg", "Kilogram"
    GRAM = "g", "Gram"
    LITER = "L", "Liter"
    MILLILITER = "mL", "Milliliter"
    UNIT = "unit", "Unit"


class Product(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    sku = models.CharField(max_length=100)
    unit_type = models.CharField(max_length=4, choices=UnitType.choices)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="products"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ["sku", "created_by"]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.sku})"


class Stock(models.Model):
    class Source(models.TextChoices):
        MANUAL = "manual", "Manual"
        PURCHASE_ORDER = "purchase_order", "Purchase Order"

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="stocks")
    quantity = models.DecimalField(max_digits=12, decimal_places=4)
    available_quantity = models.DecimalField(max_digits=12, decimal_places=4)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2)
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.MANUAL)
    purchase_order_item = models.ForeignKey(
        "purchases.PurchaseOrderItem",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="stock_entries",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="stocks"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Stock #{self.id} - {self.product.name} ({self.available_quantity}/{self.quantity})"
