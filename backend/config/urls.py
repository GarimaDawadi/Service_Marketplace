from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/catalog/", include("catalog.urls")),
    path("api/bookings/", include("bookings.urls")),
    path("api/chat/", include("chats.urls")),
    path("api/payments/", include("payments.urls")),
    path("api/reviews/", include("reviews.urls")),
    path("api/notifications/", include("notifications.urls")),
    path("api/platform/", include("platformcore.urls")),
]
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)