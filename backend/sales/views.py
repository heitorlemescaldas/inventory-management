from django.db import transaction
from django.db.models import Sum
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from products.models import Stock

from .models import SalesOrder
from .serializers import SalesOrderSerializer


class SalesOrderViewSet(viewsets.ModelViewSet):
    serializer_class = SalesOrderSerializer
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        return (
            SalesOrder.objects.filter(created_by=self.request.user)
            .prefetch_related("items__product")
        )

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        order = self.get_object()
        if order.status != SalesOrder.Status.DRAFT:
            return Response(
                {"error": f"Cannot confirm order with status '{order.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        errors = []
        for item in order.items.select_related("product"):
            available = (
                Stock.objects.filter(
                    product=item.product,
                    created_by=request.user,
                    available_quantity__gt=0,
                ).aggregate(total=Sum("available_quantity"))["total"]
                or 0
            )
            if available < item.quantity:
                errors.append(
                    f"Insufficient stock for {item.product.name}: "
                    f"need {item.quantity}, have {available}"
                )
        if errors:
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            for item in order.items.select_related("product"):
                remaining = item.quantity
                stocks = Stock.objects.filter(
                    product=item.product,
                    created_by=request.user,
                    available_quantity__gt=0,
                ).order_by("created_at")

                for stock in stocks:
                    if remaining <= 0:
                        break
                    deduct = min(stock.available_quantity, remaining)
                    stock.available_quantity -= deduct
                    stock.save()
                    remaining -= deduct

            order.status = SalesOrder.Status.CONFIRMED
            order.save()

        return Response(SalesOrderSerializer(order).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        order = self.get_object()
        if order.status != SalesOrder.Status.DRAFT:
            return Response(
                {"error": f"Cannot cancel order with status '{order.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        order.status = SalesOrder.Status.CANCELLED
        order.save()
        return Response(SalesOrderSerializer(order).data)
