import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { authApi } from "../../services/api/authApi";
import { getApiErrorMessage } from "../../services/api/client";
import AuthLayout, { authFormStyles as s } from "../../components/AuthLayout";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; code?: string }>();
  const [email, setEmail] = useState(params.email?.toString() || "");
  const [code, setCode] = useState(params.code?.toString() || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState<{ visible: boolean; type: FeedbackType; title: string; message: string; onConfirm?: () => void }>({
    visible: false, type: "info", title: "", message: "",
  });

  const show = (type: FeedbackType, title: string, message: string, onConfirm?: () => void) =>
    setPopup({ visible: true, type, title, message, onConfirm });
  const close = () => {
    const callback = popup.onConfirm;
    setPopup((value) => ({ ...value, visible: false, onConfirm: undefined }));
    callback?.();
  };

  const submit = async () => {
    if (!email.trim() || !code.trim() || !newPassword) {
      show("error", "Missing fields", "Enter your email, reset code, and new password.");
      return;
    }
    if (newPassword.length < 8) {
      show("error", "Too short", "Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      show("error", "Mismatch", "Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const response = await authApi.resetPassword({ email: email.trim().toLowerCase(), code: code.trim(), new_password: newPassword });
      show("success", "Password reset", response.message, () => router.replace("/login"));
    } catch (error) {
      show("error", "Reset failed", getApiErrorMessage(error, "Invalid or expired reset code."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Reset password" subtitle="Use the one-time code sent to your email to choose a new password." showBack>
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.label}>Email</Text>
          <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={s.input} />
          <Text style={s.label}>Reset code</Text>
          <TextInput value={code} onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" maxLength={6} style={s.input} />
          <Text style={s.label}>New password</Text>
          <TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry style={s.input} />
          <Text style={s.label}>Confirm password</Text>
          <TextInput value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry style={s.input} />
          <TouchableOpacity onPress={submit} disabled={loading} style={[s.button, loading && s.buttonDisabled]}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Reset password</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
      <FeedbackModal visible={popup.visible} type={popup.type} title={popup.title} message={popup.message} onClose={close} confirmLabel={popup.type === "success" ? "Sign in" : "OK"} />
    </AuthLayout>
  );
}
