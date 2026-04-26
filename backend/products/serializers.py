from django.db import models as dj_models
from rest_framework import serializers

from .models import Product, Stock


class ProductSerializer(serializers.ModelSerializer):
    current_stock = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "description",
            "sku",
            "unit_type",
            "current_stock",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_current_stock(self, obj):
        total = obj.stocks.aggregate(total=dj_models.Sum("available_quantity"))["total"]
        return str(total or 0)

    def validate_sku(self, value):
        request = self.context.get("request")
        if request is None:
            return value
        qs = Product.objects.filter(created_by=request.user, sku=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                "You already have a product with this SKU."
            )
        return value


class StockSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = Stock
        fields = [
            "id",
            "product",
            "product_name",
            "quantity",
            "available_quantity",
            "unit_cost",
            "source",
            "created_at",
        ]
        read_only_fields = ["id", "available_quantity", "source", "created_at"]

    def validate_product(self, product):
        request = self.context.get("request")
        if request and product.created_by_id != request.user.id:
            raise serializers.ValidationError("Product not found.")
        return product

    def create(self, validated_data):
        validated_data["available_quantity"] = validated_data["quantity"]
        validated_data["source"] = Stock.Source.MANUAL
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)
