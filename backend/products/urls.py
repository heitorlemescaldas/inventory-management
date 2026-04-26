from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ProductViewSet, StockViewSet

router = DefaultRouter()
router.register("", ProductViewSet, basename="product")

stock_router = DefaultRouter()
stock_router.register("", StockViewSet, basename="stock")

urlpatterns = [
    path("", include(router.urls)),
]

stock_urlpatterns = [
    path("", include(stock_router.urls)),
]
