from rest_framework.response import Response
from rest_framework.views import APIView

from products.models import Product

from .utils import all_products_summary, overall_totals, product_financial_summary


class DashboardView(APIView):
    def get(self, request):
        user = request.user
        totals = overall_totals(user)
        return Response(
            {
                "total_revenue": str(totals["total_revenue"]),
                "total_cost": str(totals["total_cost"]),
                "total_profit": str(totals["total_profit"]),
                "profit_margin": str(totals["profit_margin"]),
                "products_summary": all_products_summary(user),
            }
        )


class ProductFinancialView(APIView):
    def get(self, request, product_id):
        user = request.user
        try:
            product = Product.objects.get(id=product_id, created_by=user)
        except Product.DoesNotExist:
            return Response({"error": "Product not found"}, status=404)
        return Response(product_financial_summary(product, user))
