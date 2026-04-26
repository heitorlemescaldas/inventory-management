from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from products.models import Stock

from .models import PurchaseOrder
from .serializers import PurchaseOrderSerializer


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseOrderSerializer
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        return (
            PurchaseOrder.objects.filter(created_by=self.request.user)
            .prefetch_related("items__product")
        )

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        order = self.get_object()
        if order.status != PurchaseOrder.Status.DRAFT:
            return Response(
                {"error": f"Cannot confirm order with status '{order.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            for item in order.items.all():
                Stock.objects.create(
                    product=item.product,
                    quantity=item.quantity,
                    available_quantity=item.quantity,
                    unit_cost=item.unit_price,
                    source=Stock.Source.PURCHASE_ORDER,
                    purchase_order_item=item,
                    created_by=request.user,
                )
            order.status = PurchaseOrder.Status.CONFIRMED
            order.save()
        return Response(PurchaseOrderSerializer(order).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        order = self.get_object()
        if order.status != PurchaseOrder.Status.DRAFT:
            return Response(
                {"error": f"Cannot cancel order with status '{order.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        order.status = PurchaseOrder.Status.CANCELLED
        order.save()
        return Response(PurchaseOrderSerializer(order).data)
