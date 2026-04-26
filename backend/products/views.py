from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets

from .models import Product, Stock
from .serializers import ProductSerializer, StockSerializer


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "sku"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        return Product.objects.filter(created_by=self.request.user)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class StockViewSet(viewsets.ModelViewSet):
    serializer_class = StockSerializer
    filterset_fields = ["product"]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        return Stock.objects.filter(created_by=self.request.user).select_related("product")
