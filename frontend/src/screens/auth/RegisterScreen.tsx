
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { authApi } from "../../services/api/authApi";
import { getApiErrorMessage } from "../../services/api/client";
import { setAuth, getPostLoginRoute } from "../../auth/auth";
import AuthLayout, { authFormStyles as s } from "../../components/AuthLayout";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import { PRIMARY, HERO_BG } from "../../theme/colors";

const RESEND_COOLDOWN = 30;

export default function RegisterScreen() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  // Backend uses CLIENT / FREELANCER.
  const [role, setRole] = useState<"CLIENT" | "FREELANCER">("CLIENT");

  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Access token returned by /api/auth/register/
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [popup, setPopup] = useState<{
    visible: boolean;
    type: FeedbackType;
    title: string;
    message: string;
    onConfirm?: () => void;
  }>({
    visible: false,
    type: "info",
    title: "",
    message: "",
  });

  const showPopup = (
    type: FeedbackType,
    title: string,
    message: string,
    onConfirm?: () => void
  ) =>
    setPopup({
      visible: true,
      type,
      title,
      message,
      onConfirm,
    });

  const closePopup = () => {
    const cb = popup.onConfirm;

    setPopup((p) => ({
      ...p,
      visible: false,
      onConfirm: undefined,
    }));

    cb?.();
  };

  useEffect(() => {
    if (cooldown <= 0) return;

    const t = setInterval(
      () => setCooldown((c) => (c <= 1 ? 0 : c - 1)),
      1000
    );

    return () => clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: otpSent ? 1 : 0,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [otpSent, fadeAnim]);

  const normalizeEmail = (v: string) => v.trim().toLowerCase();

  /**
   * Register the account.
   *
   * The backend automatically generates and sends the OTP.
   * It also returns an access token which is required to verify the OTP.
   */
  const sendOtp = async () => {
    if (!username.trim()) {
      showPopup("error", "Username required", "Please enter a username.");
      return;
    }

    if (!email.trim()) {
      showPopup("error", "Email required", "Enter your email to receive the OTP code.");
      return;
    }

    if (!phone.trim()) {
      showPopup("error", "Phone required", "Please enter your phone number.");
      return;
    }

    if (password.length < 8) {
      showPopup(
        "error",
        "Password too short",
        "Password must be at least 8 characters."
      );
      return;
    }

    if (cooldown > 0) return;

    setSendingOtp(true);

    try {
      const res = await authApi.register({
        username: username.trim(),
        email: normalizeEmail(email),
        phone: phone.trim(),
        password,
        role,
      });

      // Save the access token because OTP verification requires authentication.
      setAccessToken(res.data.access);

      setOtpSent(true);
      setCooldown(RESEND_COOLDOWN);

      // Development only: backend returns debug_otp when DEBUG=True.
      const devOtp = res.data.debug_otp;

      if (__DEV__ && devOtp) {
        setOtp(devOtp);
      }

      showPopup(
        "success",
        "OTP sent",
        __DEV__ && devOtp
          ? "Your account was created. Enter the OTP code to verify your account."
          : "Your account was created. Check your email for the 6-digit OTP code."
      );
    } catch (err) {
      showPopup(
        "error",
        "Registration failed",
        getApiErrorMessage(err, "Could not create account.")
      );
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOtpRegister = async () => {
    if (!accessToken) {
      showPopup(
        "error",
        "Session missing",
        "Please register again to receive a new verification session."
      );
      return;
    }

    if (!otp.trim()) {
      showPopup("error", "OTP required", "Please enter the OTP code.");
      return;
    }

    if (otp.trim().length !== 6) {
      showPopup("error", "Invalid OTP", "Please enter the 6-digit OTP code.");
      return;
    }

    setVerifying(true);

    try {
      const res = await authApi.verifyOtp(
        accessToken,
        otp.trim()
      );

      if (!res.data.access) {
        showPopup(
          "error",
          "Verification failed",
          "No access token returned from server."
        );
        return;
      }

      const user = res.data.user;

      await setAuth({
        access: res.data.access,
        refresh: res.data.refresh,
        role: user.role,
        username: user.username,
        email: user.email,
      });

      const route = await getPostLoginRoute(user.role);

      showPopup(
        "success",
        "Account verified",
        "Your account has been created and verified successfully.",
        () => router.replace(route)
      );
    } catch (err) {
      showPopup(
        "error",
        "Verification failed",
        getApiErrorMessage(err, "Invalid or expired OTP.")
      );
    } finally {
      setVerifying(false);
    }
  };

  /**
   * Resend OTP.
   *
   * This endpoint requires the access token returned during registration.
   */
  const resendOtp = async () => {
    if (!accessToken) {
      showPopup(
        "error",
        "Session missing",
        "Please register again to request another OTP."
      );
      return;
    }

    if (cooldown > 0) return;

    setSendingOtp(true);

    try {
      const res = await authApi.requestOtp(accessToken);

      setCooldown(RESEND_COOLDOWN);

      const devOtp = res.data.debug_otp;

      if (__DEV__ && devOtp) {
        setOtp(devOtp);
      }

      showPopup(
        "success",
        "OTP resent",
        __DEV__ && devOtp
          ? "A new OTP was generated."
          : "A new OTP has been sent to your email."
      );
    } catch (err) {
      showPopup(
        "error",
        "OTP failed",
        getApiErrorMessage(err, "Could not resend OTP.")
      );
    } finally {
      setSendingOtp(false);
    }
  };

  const step = otpSent ? 2 : 1;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <AuthLayout
        title="Create account"
        subtitle="Register → verify email OTP → login. Choose customer or provider."
        showBack
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.stepRow}>
            <View style={[s.step, step >= 1 && s.stepActive]} />
            <View style={[s.step, step >= 2 && s.stepActive]} />
          </View>

          <View style={s.roleRow}>
            {(["CLIENT", "FREELANCER"] as const).map((r) => (
              <TouchableOpacity
                key={r}
                style={[
                  s.roleChip,
                  role === r && s.roleChipActive,
                ]}
                onPress={() => setRole(r)}
              >
                <Text
                  style={[
                    s.roleText,
                    role === r && s.roleTextActive,
                  ]}
                >
                  {r === "CLIENT" ? "Customer" : "Provider"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.card}>
            <Text style={s.label}>Username</Text>

            <TextInput
              placeholder="Choose a username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              style={s.input}
            />

            <Text style={s.label}>Email</Text>

            <TextInput
              placeholder="you@email.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              style={s.input}
            />

            <Text style={s.label}>Phone</Text>

            <TextInput
              placeholder="98XXXXXXXX"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              style={s.input}
            />

            <Text style={s.label}>Password</Text>

            <TextInput
              placeholder="Min. 8 characters"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={s.input}
            />

            {otpSent && (
              <Animated.View style={{ opacity: fadeAnim }}>
                <Text style={s.label}>OTP code</Text>

      <TextInput
  placeholder="6-digit code"
  value={otp}
  onChangeText={(value) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 6);
    setOtp(cleaned);
  }}
  keyboardType="number-pad"
  textContentType="oneTimeCode"
  autoComplete="one-time-code"
  maxLength={6}
  autoCorrect={false}
  style={[
    s.input,
    {
      borderColor: PRIMARY,
      backgroundColor: HERO_BG,
      textAlign: "center",
      fontSize: 22,
      fontWeight: "700",
      letterSpacing: 6,
    },
  ]}
/>
              </Animated.View>
            )}

            {!otpSent ? (
              <TouchableOpacity
                onPress={sendOtp}
                disabled={sendingOtp}
                style={[
                  s.button,
                  sendingOtp && s.buttonDisabled,
                ]}
              >
                {sendingOtp ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.buttonText}>
                    Create Account & Send OTP
                  </Text>
                )}
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  onPress={verifyOtpRegister}
                  disabled={verifying}
                  style={[
                    s.button,
                    verifying && s.buttonDisabled,
                  ]}
                >
                  {verifying ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={s.buttonText}>
                      Verify & Continue
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={resendOtp}
                  disabled={sendingOtp || cooldown > 0}
                  style={{
                    alignItems: "center",
                    marginTop: 14,
                  }}
                >
                  <Text
                    style={{
                      color: cooldown > 0 ? "#aaa" : "#C66992",
                      fontWeight: "600",
                    }}
                  >
                    {cooldown > 0
                      ? `Resend OTP in ${cooldown}s`
                      : "Resend OTP"}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={s.linkRow}
              onPress={() => router.replace("/login")}
            >
              <Text style={s.link}>
                Already have an account?{" "}
                <Text style={s.linkBold}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </AuthLayout>

      <FeedbackModal
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={closePopup}
        confirmLabel={
          popup.type === "success" ? "Continue" : "OK"
        }
      />
    </KeyboardAvoidingView>
  );
}

