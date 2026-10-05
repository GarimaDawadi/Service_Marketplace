from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed


class AccountJWTAuthentication(JWTAuthentication):
    """Honor the marketplace account-disable flag on every authenticated API request."""

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if not user.is_active_account:
            raise AuthenticationFailed("This account has been disabled.", code="account_disabled")
        return user
