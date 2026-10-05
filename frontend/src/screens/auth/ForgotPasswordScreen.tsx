import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { authApi } from "../../services/api/authApi";
import { getApiErrorMessage } from "../../services/api/client";
import AuthLayout, { authFormStyles as s } from "../../components/AuthLayout";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState({
    visible: false,
    type: "info" as FeedbackType,
    title: "",
    message: "",
    onConfirm: undefined as (() => void) | undefined,
  });

  const show = (
    type: FeedbackType,
    title: string,
    message: string,
    onConfirm?: () => void
  ) => setPopup({ visible: true, type, title, message, onConfirm });

  const close = () => {
    const cb = popup.onConfirm;
    setPopup((p) => ({ ...p, visible: false, onConfirm: undefined }));
    cb?.();
  };

  const submit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      show("error", "Email required", "Enter the email linked to your account.");
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.forgotPassword(trimmed);
      show(
        "success",
        "Check your email",
        __DEV__ && res.debug_otp ? `Development reset code: ${res.debug_otp}` : res.message,
        () => router.push({
          pathname: "/reset-password",
          params: { email: trimmed, ...( __DEV__ && res.debug_otp ? { code: res.debug_otp } : {}) },
        } as never)
      );
    } catch (err) {
      show("error", "Failed", getApiErrorMessage(err, "Could not send reset email."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Forgot password"
      subtitle="Enter your email. We will send a one-time code to verify your account."
      showBack
    >
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.label}>Email</Text>
          <TextInput
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={s.input}
          />
          <TouchableOpacity
            onPress={submit}
            disabled={loading}
            style={[s.button, loading && s.buttonDisabled]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.buttonText}>Send reset email</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={s.linkRow} onPress={() => router.push("/reset-password")}>
            <Text style={s.link}>
              Have a token? <Text style={s.linkBold}>Reset password</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <FeedbackModal
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={close}
        confirmLabel={popup.type === "success" ? "Continue" : "OK"}
      />
    </AuthLayout>
  );
}
