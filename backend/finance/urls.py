from django.urls import path

from .views import DashboardView, ProductFinancialView

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="finance-dashboard"),
    path(
        "products/<int:product_id>/",
        ProductFinancialView.as_view(),
        name="product-financial",
    ),
]
