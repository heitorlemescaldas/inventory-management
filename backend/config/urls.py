"""
URL configuration for config project.
"""

from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from products.urls import stock_urlpatterns

urlpatterns = [
    path("admin/", admin.site.urls),
    # API endpoints
    path("api/auth/", include("accounts.urls")),
    path("api/products/", include("products.urls")),
    path("api/stocks/", include(stock_urlpatterns)),
    path("api/purchase-orders/", include("purchases.urls")),
    path("api/sales-orders/", include("sales.urls")),
    path("api/finance/", include("finance.urls")),
    # API documentation
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
]
