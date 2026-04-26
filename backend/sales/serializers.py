from rest_framework import serializers

from .models import SalesOrder, SalesOrderItem


class SalesOrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    total_price = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True
    )

    class Meta:
        model = SalesOrderItem
        fields = [
            "id",
            "product",
            "product_name",
            "quantity",
            "unit_price",
            "total_price",
        ]
        read_only_fields = ["id"]


class SalesOrderSerializer(serializers.ModelSerializer):
    items = SalesOrderItemSerializer(many=True)
    total_revenue = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True
    )

    class Meta:
        model = SalesOrder
        fields = [
            "id",
            "status",
            "customer",
            "notes",
            "items",
            "total_revenue",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "status", "created_at", "updated_at"]

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError("At least one item is required.")
        request = self.context.get("request")
        if request:
            for item in items:
                product = item["product"]
                if product.created_by_id != request.user.id:
                    raise serializers.ValidationError(
                        f"Product {product.id} not found."
                    )
        return items

    def create(self, validated_data):
        items_data = validated_data.pop("items")
        sales_order = SalesOrder.objects.create(**validated_data)
        for item_data in items_data:
            SalesOrderItem.objects.create(sales_order=sales_order, **item_data)
        return sales_order
